import {type Chain,type JointType} from './core/urdf';
import {type ViewState} from './view';
import {type Robot,type ChainDraft,parseURDF,robotFromChain,extractChain,descendants,tipOf,draftFromChain,chainFromDraft,MAX_FILE_BYTES,TYPES} from './core/robot';
import {type LabSession,type CameraSnapshot,parseSession,serializeSession,exportDH} from './core/session';
import {convertToDH} from './core/dh';
import {type Workspace} from './core/workspace';
import {identity} from './core/math';

export const escapeHTML=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Actions {getState:()=>ViewState;loadChain:(c:Chain)=>void;camera:()=>CameraSnapshot|undefined;loadSession:(s:LabSession)=>void;pause:()=>void;workspace:()=>Workspace}
type Tab='import'|'editor'|'session'|'export';
const exampleXML=`<robot name="My arm">
  <link name="base"/>
  <link name="arm"/>
  <link name="tip"/>
  <joint name="shoulder" type="revolute">
    <parent link="base"/><child link="arm"/>
    <origin xyz="0 0 0.3" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="10" velocity="1"/>
  </joint>
  <joint name="tool_mount" type="fixed">
    <parent link="arm"/><child link="tip"/>
    <origin xyz="1 0 0" rpy="0 0 0"/>
  </joint>
</robot>`;

export function createFileWorkflow(actions:Actions){
 let committed=robotFromChain(actions.getState().chain),pending=committed,draft=draftFromChain(actions.getState().chain),tab:Tab='import';
 let draftReady=true;
 let pendingTool=actions.getState().chain.tool;
 const dialog=document.createElement('dialog');dialog.id='robot-dialog';dialog.setAttribute('aria-labelledby','robot-dialog-title');
 dialog.innerHTML=`
 <div class="dialog-heading"><div><span class="eyebrow">YOUR MECHANISM</span><h2 id="robot-dialog-title">Robot & files</h2></div><button id="close-files" aria-label="Close robot and files">Close ×</button></div>
 <div class="file-tabs" role="tablist" aria-label="Robot workflows">${(['import','editor','session','export'] as Tab[]).map(t=>'<button role="tab" id="tab-'+t+'" data-file-tab="'+t+'" aria-controls="panel-'+t+'">'+({import:'Import URDF',editor:'Chain editor',session:'Session',export:'Export DH'}[t])+'</button>').join('')}</div>
 <p class="file-status" id="file-status" role="status" aria-live="polite"></p>
 <section id="panel-import" role="tabpanel" aria-labelledby="tab-import">
 <p class="dialog-copy">Paste an expanded URDF or choose a local file. Select a base and a descendant tip to study one chain. Meshes are optional and are not loaded.</p>
 <label class="file-picker">URDF file <input id="urdf-file" type="file" accept=".urdf,.xml,text/xml,application/xml"></label>
 <label for="urdf-text">URDF XML</label><textarea id="urdf-text" spellcheck="false" rows="9" placeholder="<robot name=&quot;my_robot&quot;>…</robot>"></textarea>
 <div class="file-actions"><button id="sample-urdf">Insert small example</button><button id="inspect-urdf" class="primary">Read URDF</button></div>
 <div class="chain-picker"><h3 id="pending-robot-name"></h3><p id="pending-robot-info" class="dialog-copy"></p><div class="selection-fields"><label>Base link<select id="base-link"></select></label><label>Tip link<select id="tip-link"></select></label></div><p id="chain-summary" class="dialog-copy"></p><ul id="import-warnings"></ul><button id="open-chain" class="primary">Open selected chain</button></div>
 <p class="dialog-copy">Supported: fixed, revolute, continuous, and prismatic joints. Xacro expansion, mimic coupling, floating/planar joints, and closed loops are not supported.</p>
 </section>
 <section id="panel-editor" role="tabpanel" aria-labelledby="tab-editor" hidden>
 <p class="dialog-copy">Edit the current serial chain, or start a new one. Links are generated in order. Applying an edit creates a serial model from this chain; other branches are not included.</p>
 <div class="editor-top"><label>Robot name<input id="editor-name" maxlength="200"></label><button id="new-chain">Start new chain</button></div>
 <p class="editor-units">XYZ / prismatic limits: meters · RPY / revolute limits: radians</p>
 <div id="editor-joints"></div><button id="add-joint">+ Add joint</button>
 <fieldset class="tool-editor"><legend>Fixed tool offset after the last link</legend><label>Tool XYZ (m)<input id="tool-xyz" placeholder="0 0 0"></label><label>Tool RPY (rad)<input id="tool-rpy" placeholder="0 0 0"></label></fieldset>
 <button id="apply-editor" class="primary">Apply chain</button>
 </section>
 <section id="panel-session" role="tabpanel" aria-labelledby="tab-session" hidden>
 <p class="dialog-copy">Save the complete robot tree, selected chain, tool offset, joint positions, frame visibility, construction step, display units, and camera. Load the JSON file later to continue.</p>
 <button id="save-session" class="primary">Save session JSON</button>
 <label class="file-picker">Load session JSON<input id="session-file" type="file" accept=".json,application/json"></label>
 <p class="dialog-copy">Files are processed on this device. Nothing is uploaded.</p>
 </section>
 <section id="panel-export" role="tabpanel" aria-labelledby="tab-export" hidden>
 <p class="dialog-copy">A complete standard-DH description: reference parameters, joint-variable mapping, units, source joints, and both base and tool transforms. Exported values use meters and radians regardless of the display units.</p>
 <button id="export-dh" class="primary">Download DH JSON</button><details><summary>Preview export</summary><pre id="export-preview"></pre></details>
 </section>`;
 document.body.append(dialog);
 const $=<T extends HTMLElement=HTMLElement>(s:string)=>dialog.querySelector<T>(s)!;
 const report=(message:string,error=false)=>{$('#file-status').textContent=message;$('#file-status').classList.toggle('error',error);};
 function guarded(fn:()=>void){try{fn();}catch(e){report(e instanceof Error?e.message:String(e),true);}}
 async function fileText(file:File){if(file.size>MAX_FILE_BYTES)throw Error('Choose a file no larger than 2 MB.');return file.text();}
 function download(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const filename=(suffix:string)=>actions.getState().chain.name.replace(/[^a-z0-9_-]/gi,'_').slice(0,80)+'-'+suffix+'.json';
 function drawPicker(base=pending.root,tip?:string){
  $('#pending-robot-name').textContent=pending.name;$('#pending-robot-info').textContent=pending.links.length+' links · '+pending.joints.length+' joints';
  $<HTMLSelectElement>('#base-link').replaceChildren(...pending.links.map(l=>new Option(l,l)));
  $<HTMLSelectElement>('#base-link').value=base;drawTips(tip);
  $('#import-warnings').replaceChildren(...pending.warnings.map(w=>{const li=document.createElement('li');li.textContent=w;return li;}));
 }
 function drawTips(tip?:string){const links=descendants(pending,$<HTMLSelectElement>('#base-link').value);$<HTMLSelectElement>('#tip-link').replaceChildren(...links.map(l=>new Option(l,l)));$<HTMLSelectElement>('#tip-link').value=tip&&links.includes(tip)?tip:links.at(-1)!;describeSelection();}
 function selectedChain(){return extractChain(pending,$<HTMLSelectElement>('#base-link').value,$<HTMLSelectElement>('#tip-link').value,pendingTool);}
 function describeSelection(){guarded(()=>{const c=selectedChain();$('#chain-summary').textContent=c.joints.filter(j=>j.type!=='fixed').length+' moving joints · '+c.joints.filter(j=>j.type==='fixed').length+' fixed adapters on this path.';});}
 function inspect(){const parsed=parseURDF($<HTMLTextAreaElement>('#urdf-text').value);pending=parsed;pendingTool=identity();drawPicker();report('URDF read. Choose a chain, then open it.');}
 function readDraft(){
  draft.name=$<HTMLInputElement>('#editor-name').value;draft.toolXYZ=$<HTMLInputElement>('#tool-xyz').value;draft.toolRPY=$<HTMLInputElement>('#tool-rpy').value;
  draft.joints=Array.from(dialog.querySelectorAll<HTMLElement>('.joint-editor')).map(el=>{const value=(key:string)=>(el.querySelector('[data-field="'+key+'"]') as HTMLInputElement).value;return {name:value('name'),type:value('type') as JointType,xyz:value('xyz'),rpy:value('rpy'),axis:value('axis'),lower:value('lower'),upper:value('upper')};});
 }
 function drawDraft(){
  $<HTMLInputElement>('#editor-name').value=draft.name;$<HTMLInputElement>('#tool-xyz').value=draft.toolXYZ;$<HTMLInputElement>('#tool-rpy').value=draft.toolRPY;
  $('#editor-joints').innerHTML=draft.joints.map((j,i)=>'<fieldset class="joint-editor"><legend>Joint '+(i+1)+' · '+(i?'link_'+i:'base')+' → link_'+(i+1)+'</legend><div class="joint-editor-grid"><label>Name<input data-field="name" aria-label="Joint '+(i+1)+' name" value="'+escapeHTML(j.name)+'"></label><label>Type<select data-field="type" aria-label="Joint '+(i+1)+' type">'+TYPES.map(t=>'<option '+(t===j.type?'selected':'')+' value="'+t+'">'+t+'</option>').join('')+'</select></label>'+(['xyz','rpy','axis','lower','upper'] as const).map(key=>'<label>'+({xyz:'Origin XYZ (m)',rpy:'Origin RPY (rad)',axis:'Axis XYZ',lower:'Lower limit',upper:'Upper limit'}[key])+'<input data-field="'+key+'" aria-label="Joint '+(i+1)+' '+key+'" value="'+escapeHTML(j[key])+'" '+((j.type==='fixed'&&['axis','lower','upper'].includes(key)||j.type==='continuous'&&['lower','upper'].includes(key))?'disabled':'')+'></label>').join('')+'</div><div class="joint-order"><button data-move="'+i+'" data-delta="-1" '+(i===0?'disabled':'')+'>Move up</button><button data-move="'+i+'" data-delta="1" '+(i===draft.joints.length-1?'disabled':'')+'>Move down</button><button data-remove="'+i+'">Remove joint '+(i+1)+'</button></div></fieldset>').join('');
 }
 function open(next:Tab='import'){
  actions.pause();report('');if(tab==='editor'&&dialog.open)readDraft();if(!draftReady){draft=draftFromChain(actions.getState().chain);draftReady=true;}drawDraft();tab=next;
  if(next==='import'){pending=committed;pendingTool=actions.getState().chain.tool;drawPicker(actions.getState().chain.base,tipOf(actions.getState().chain));}
  setTab(next);if(!dialog.open)dialog.showModal();
 }
 function setTab(next:Tab){
  if(tab==='editor'&&next!=='editor')readDraft();tab=next;
  dialog.querySelectorAll<HTMLElement>('[data-file-tab]').forEach(el=>{const active=el.dataset.fileTab===next;el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
  for(const t of ['import','editor','session','export'])$('#panel-'+t).hidden=t!==next;
  if(next==='export')$('#export-preview').textContent=JSON.stringify(exportDH(actions.getState().chain,actions.getState().q),null,2);
 }
 dialog.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
  guarded(()=>{
   if(b.dataset.fileTab){if(b.dataset.fileTab==='editor'&&tab!=='editor')drawDraft();setTab(b.dataset.fileTab as Tab);report('');}
   if(b.dataset.remove!==undefined){readDraft();draft.joints.splice(Number(b.dataset.remove),1);drawDraft();}
   if(b.dataset.move!==undefined){readDraft();const i=Number(b.dataset.move),j=i+Number(b.dataset.delta);[draft.joints[i],draft.joints[j]]=[draft.joints[j],draft.joints[i]];drawDraft();}
   switch(b.id){
    case 'close-files':dialog.close();break;
    case 'sample-urdf':$<HTMLTextAreaElement>('#urdf-text').value=exampleXML;report('Example inserted. Click Read URDF to inspect it.');break;
    case 'inspect-urdf':inspect();break;
    case 'open-chain':{const c=selectedChain();convertToDH(c);actions.loadChain(c);committed=pending;draftReady=false;dialog.close();break;}
    case 'new-chain':draft={name:'My robot',joints:[],toolXYZ:'0 0 0',toolRPY:'0 0 0'};drawDraft();report('Add joints to build a new serial chain.');break;
    case 'add-joint':{readDraft();let n=draft.joints.length+1;while(draft.joints.some(j=>j.name==='joint_'+n))n++;draft.joints.push({name:'joint_'+n,type:'revolute',xyz:draft.joints.length?'1 0 0':'0 0 0.3',rpy:'0 0 0',axis:'0 0 1',lower:String(-Math.PI),upper:String(Math.PI)});drawDraft();break;}
    case 'apply-editor':{readDraft();const c=chainFromDraft(draft);convertToDH(c);actions.loadChain(c);committed=robotFromChain(c);pending=committed;pendingTool=c.tool;dialog.close();break;}
    case 'save-session':{const s=actions.getState();const session:LabSession={format:'frame-lab-session',version:2,robot:committed,selection:{base:s.chain.base,tip:tipOf(s.chain),tool:s.chain.tool},q:s.q,view:{selected:s.selected,focus:s.focus,mode:s.mode,progress:s.progress,degrees:s.degrees,layers:s.layers,hiddenFrames:[...s.hiddenFrames],camera:actions.camera(),workspace:actions.workspace()}};download(filename('session'),serializeSession(session));report('Session downloaded.');break;}
    case 'export-dh':download(filename('dh'),JSON.stringify(exportDH(actions.getState().chain,actions.getState().q),null,2));report('DH parameters and boundary transforms downloaded.');break;
   }
  });
 });
 dialog.addEventListener('change',async e=>{const el=e.target as HTMLInputElement;
  if(el.id==='base-link'){const previousTip=$<HTMLSelectElement>('#tip-link').value;if(!descendants(pending,el.value).includes(previousTip))pendingTool=identity();drawTips(previousTip);}
  if(el.id==='tip-link'){pendingTool=identity();describeSelection();}
  if(el.dataset.field==='type'){readDraft();drawDraft();}
  if(el.id==='urdf-file'||el.id==='session-file'){
   const file=el.files?.[0];if(!file)return;
   try{const text=await fileText(file);if(el.id==='urdf-file'){$<HTMLTextAreaElement>('#urdf-text').value=text;inspect();}else{const session=parseSession(text);actions.loadSession(session);committed=session.robot;pending=committed;pendingTool=session.selection.tool;draftReady=false;dialog.close();}}
   catch(error){report(error instanceof Error?error.message:String(error),true);}finally{el.value='';}
  }
 });
 dialog.addEventListener('keydown',e=>{const target=e.target as HTMLElement;if(target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=['import','editor','session','export'] as Tab[];const i=e.key==='Home'?0:e.key==='End'?3:(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:3))%4;setTab(tabs[i]);$('#tab-'+tabs[i]).focus();}});
 dialog.addEventListener('close',()=>{if(tab==='editor'&&draftReady)readDraft();});
 dialog.addEventListener('input',()=>{if(tab==='editor')report('Unapplied draft · changes are kept until you apply them.');});
 drawDraft();drawPicker();
 return {open,resetSource:(c:Chain)=>{committed=robotFromChain(c);pending=committed;pendingTool=c.tool;draft=draftFromChain(c);draftReady=true;drawDraft();}};
}
