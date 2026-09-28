import './style.css';
import {createWorkspace,taskDefaults,migrateWorkspace,type Workspace,type Task} from './core/workspace';
import {examples} from './core/examples';
import {convertToDH,evaluated,verifyPose,dhFK} from './core/dh';
import {urdfFK,type Chain} from './core/urdf';
import {initialPose,motionRange,extractChain} from './core/robot';
import {type LabSession} from './core/session';
import {createFileWorkflow,escapeHTML} from './files-ui';
import {createComparison} from './comparison-ui';
import {type Mat4,position} from './core/math';
import {RobotView,type ViewState} from './view';

const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const state:ViewState={chain:examples[0],model:convertToDH(examples[0]),q:initialPose(examples[0]),selected:0,focus:false,mode:'joint',progress:0,degrees:true,layers:{links:true,axes:true,urdf:false,dh:true,normals:true,dimensions:false,ghost:true,tool:true},hiddenFrames:new Set()};
let workspace=createWorkspace(),canvasFocus=false;
const currentLayout=()=>workspace.tasks[workspace.task];
Object.assign(state,{layers:currentLayout().layers,presentation:currentLayout().presentation});
let playing=false,lastTime=0,sweepText='',view:RobotView|undefined;
let files:ReturnType<typeof createFileWorkflow>|undefined;
let comparison:ReturnType<typeof createComparison>|undefined;
const num=(v:number,d=3)=>Math.abs(v)<.5*10**-d?'0':v.toFixed(d);
const angle=(v:number)=>state.degrees?num(v*180/Math.PI,1)+'°':num(v)+' rad';
const matrix=(m:Mat4)=>'<div class="matrix">'+m.map(x=>'<span>'+num(x)+'</span>').join('')+'</div>';
const layerNames:Record<string,string>={glyphs:'Joint symbols',guides:'Travel guides',grid:'Ground grid',links:'Schematic links',axes:'Joint axis lines',urdf:'URDF frames',dh:'DH frames',normals:'Common normal',dimensions:'Distances & angles',ghost:'Construction frames',tool:'End-effector frames'};

$('#app').innerHTML=`
<header class="topbar">
 <div class="brand"><span class="brand-logo" aria-hidden="true">⌖</span><strong>Frame Lab</strong></div>
 <nav class="task-nav" aria-label="Workspace task"><div class="model-nav"><button data-task="model">Model</button><div class="model-identity"><strong id="model-context"></strong><small id="chain-context"></small></div></div>${[['move','Move'],['understand','Understand DH'],['check','Check & export']].map(([id,label])=>'<button data-task="'+id+'">'+label+'</button>').join('')}</nav>
 <div class="top-actions"><button id="open-settings" aria-haspopup="dialog">View & theme</button><button id="convention-toggle" aria-haspopup="dialog">Help</button><button id="canvas-focus" aria-pressed="false">Canvas focus</button></div>
</header>
<main class="workspace">
  <div class="scene-toolbar"><div class="selection-strip"><label for="joint-selector" id="selection-label">Joint</label><select id="joint-selector" aria-label="Selected joint"></select><span id="step-context"></span></div><div class="camera-buttons"><button id="fit">Fit robot</button><button id="fit-pair">Fit pair</button><button id="toggle-inspector" aria-controls="task-inspector">Show details</button><button id="toggle-table" aria-controls="table-dock">DH table</button><button id="toggle-joints" aria-controls="joint-panel">Joint controls</button></div></div>
 <section class="center-column" aria-label="Robot exploration">
  <div class="viewport-wrap"><div id="viewport"></div><div class="viewport-heading"><h1 id="scene-title"></h1><div id="scene-status"></div></div><div id="near-warning" class="near-warning" hidden>Nearly parallel axes: DH origins are far from the robot. Fit all frames from View & theme to inspect them.</div><div id="precision-warning" class="precision-warning" role="status" hidden>Numerical precision needs attention. Open Check & export for details.</div><div class="viewport-bottom">Drag to orbit · scroll at the pointer to zoom · right-drag to pan</div></div>
  <section id="table-dock" class="table-dock" aria-label="DH table" hidden><div class="dock-heading"><h2>Standard DH <small>at current q</small></h2><button data-close-panel="table">Close table</button></div><div class="table-scroll"><table class="dh-table"><thead><tr><th scope="col">Joint</th><th scope="col">θ</th><th scope="col">d <small>m</small></th><th scope="col">a <small>m</small></th><th scope="col">α</th></tr></thead><tbody id="dh-rows"></tbody></table></div><p class="table-legend">Highlighted values contain joint motion. Select a parameter to inspect it.</p></section>
  <section class="joint-panel" id="joint-panel"><div class="joint-heading"><h2 id="joint-panel-title">Move joint</h2><div><button id="expand-joints" aria-pressed="false">Expand all joints</button><button id="reset">Reset pose</button><button data-close-panel="joints">Hide controls</button></div></div><div id="joint-controls"></div></section>
 </section>
 <aside class="inspector" id="task-inspector" aria-label="Task details"><div class="inspector-heading"><h2 id="inspector-title"></h2><button data-close-panel="inspector">Hide details</button></div>
  <section data-area="model"><label for="example">Example mechanism</label><select id="example">${examples.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('')}</select><p id="example-description" class="muted"></p><div class="robot-file-buttons"><button id="open-import">Import URDF</button><button id="open-editor">Edit chain</button><button data-files="session">Open session</button></div><details><summary>Inspect source</summary><div id="source-data" class="detail-copy"></div></details><p class="muted">Your robot stays on this device. Links define connectivity; visual meshes are optional.</p></section>
  <section data-area="move"><p>Choose a joint in the strip or click its symbol, then adjust its position below the scene.</p><details><summary>Tool pose</summary><div id="tool-pose"></div></details><p class="muted">Cylinder: rotation along its axis. Carriage: translation along its guides. Block: fixed connection.</p></section>
  <section data-area="understand">
   <div class="pair-heading"><h2 id="pair-title"></h2><div class="pair-nav"><button id="previous-row" aria-label="Previous DH row">‹</button><button id="next-row" aria-label="Next DH row">›</button></div></div>
   <label for="chain-context-mode">Surrounding robot</label><select id="chain-context-mode"><option value="isolate">Isolate pair</option><option value="fade">Fade other joints</option><option value="whole">Whole chain</option></select>
   <button id="focus" class="quiet" aria-pressed="false">Isolate this pair</button>
   <div id="parameter-cards"></div><label class="check-label"><input type="checkbox" id="all-parameters"> Show all four parameters</label>
   <div class="construction-bar" id="construction-bar" hidden><div class="construction-title"><b>Frame construction · F<span id="target-frame">1</span></b><span>Robot held still</span></div><div class="transport"><button id="restart" aria-label="Restart construction">↺</button><button id="previous-step" aria-label="Previous construction step">‹</button><button id="play">Play</button><button id="next-step" aria-label="Next construction step">›</button></div><div class="scrub-row"><input id="scrubber" aria-label="Construction progress" type="range" min="0" max="4" step="0.01" value="0"><output aria-live="off" id="progress-label">0 / 4</output></div><p id="construction-explanation"></p></div>
   <div class="look-controls"><span>Look along</span><button data-look="z">θ axis · z</button><button data-look="x">α axis · x</button></div>
   <details><summary>Why this frame?</summary><div id="row-description"></div><p id="lesson"></p></details>
   <details class="boundaries"><summary>Base & tool transforms</summary><div id="boundary-matrices"></div></details><p class="chain-equation">Tᵁᴿᴰᶠ = B · A₁ · … · Aₙ · E</p>
   <button id="change-pose">Change robot pose</button>
  </section>
  <section data-area="check"><div class="verification"><div class="verification-title"><span id="verification-status">Models agree</span><span class="check-icon">✓</span></div><p>Current pose · independent URDF and DH forward kinematics.</p><details><summary>Numerical errors</summary><div class="error-row"><span>Position</span><output aria-live="off" id="position-error"></output></div><div class="error-row"><span>Orientation</span><output aria-live="off" id="orientation-error"></output></div><div class="error-row"><span>Frame position</span><output aria-live="off" id="attachment-error"></output></div><div class="error-row"><span>Frame orientation</span><output aria-live="off" id="attachment-angle-error"></output></div></details><button id="sweep">Verify 150 configurations</button><p id="sweep-result" aria-live="polite"></p><details><summary>Sampled configurations</summary><p>150 reproducible configurations inside joint limits, including both limit endpoints. Continuous joints use the displayed range. Seed: 3419. Numerical evidence, not a proof.</p><div id="sweep-samples">Run the sweep to inspect each sample.</div></details></div><h3>Check your own DH model</h3><p class="muted">Compare your parameters with the computed model across 152 configurations, including the current pose.</p><button id="open-comparison" class="primary" aria-haspopup="dialog">Compare custom DH</button><h3>Keep your work</h3><button id="open-session">Save / load session</button><p class="muted">Restore the robot, pose, camera, and workspace.</p><button id="open-export">Export DH</button><p class="muted">Reference parameters, joint mapping, units, and base/tool transforms.</p></section>
 </aside>
</main>
<dialog id="view-dialog" aria-labelledby="view-title"><div class="dialog-heading"><h2 id="view-title">View & theme</h2><button data-close-dialog>Close</button></div>
 <div class="settings-top"><label>Theme<select id="theme"><option value="system">System</option><option value="light">Light</option><option value="black">Black</option></select></label><div><span>Angles</span><button id="units">Degrees</button></div></div>
 <div class="settings-actions"><button id="projection">Perspective</button><button id="fit-all">Fit all frames</button><button id="restore-defaults">Restore task defaults</button></div>
 <h3>Overlays <small id="overlay-task"></small></h3>
 <fieldset><legend>Mechanism</legend><div class="layers">${['glyphs','links','axes','guides','grid'].map(k=>'<label><input type="checkbox" data-layer="'+k+'">'+layerNames[k]+'</label>').join('')}</div><label>Joint axes<select data-scope="axisScope"><option value="selected">Selected</option><option value="all">All</option><option value="none">None</option></select></label></fieldset>
 <fieldset><legend>Source description</legend><div class="layers"><label><input type="checkbox" data-layer="urdf">URDF frames</label></div><label>URDF frames<select data-scope="urdfScope"><option value="selected">Selected</option><option value="all">All</option><option value="none">None</option></select></label></fieldset>
 <fieldset><legend>DH construction</legend><div class="layers">${['dh','normals','dimensions','ghost'].map(k=>'<label><input type="checkbox" data-layer="'+k+'">'+layerNames[k]+'</label>').join('')}</div><label>DH frames<select data-scope="dhScope"><option value="selected">Selected pair</option><option value="all">All</option><option value="none">None</option></select></label><label class="check-label"><input id="history-frames" type="checkbox">Historical construction frames</label></fieldset>
 <fieldset><legend>End effector & labels</legend><label class="check-label"><input type="checkbox" data-layer="tool">Source frame and DH tool ring</label><label>Frame names<select data-scope="labelScope"><option value="selected">Selected</option><option value="all">All</option><option value="none">None</option></select></label></fieldset>
 <details><summary>Individual frames</summary><div id="individual-frames"></div></details>
</dialog>
<dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-heading"><h2 id="help-title">Using Frame Lab</h2><button data-close-dialog>Close</button></div><p>Start in Move to explore a mechanism. In Understand DH, inspect one pair and animate the four frame transformations. Check & export compares both kinematic descriptions.</p><details id="convention" open><summary>Standard DH convention</summary><div class="detail-copy"><p>Joint i acts about or along <b>zᵢ₋₁</b>. Frame Fᵢ is attached to the link after joint i.</p><p class="math">Aᵢ = Rz(θᵢ) Tz(dᵢ) Tx(aᵢ) Rx(αᵢ)</p><p>Right-handed, column vectors. Operations act on the moving frame. Geometry is chosen once at q = 0; frames stay attached during motion.</p><p>Positive DH axes follow the source URDF axes. B and E connect the DH description to the original base and tool.</p></div></details><details><summary>Joint symbols & camera</summary><p>Cylinders rotate about their length; the cap mark shows rotation. Prismatic carriages slide along fixed guides. Small blocks represent fixed joints.</p><p>Drag to orbit, scroll at the pointer to zoom, right-drag to pan. On touchscreens, use one finger to orbit and two to pan/zoom.</p><p>F toggles Canvas focus; Escape exits it. Shortcuts are disabled in text fields and dialogs.</p><div class="axis-key"><span class="axis-x">x · red</span><span class="axis-y">y · green</span><span class="axis-z">z · blue</span></div></details></dialog>`;

const narrowScreen=matchMedia('(max-width: 900px)');
const panelIds={inspector:'task-inspector',table:'table-dock',joints:'joint-panel'};
narrowScreen.addEventListener('change',()=>renderLayout());
const taskLabels:Record<Task,string>={model:'Model',move:'Move',understand:'Understand DH',check:'Check & export'};
function saveLayout(){const l=currentLayout();l.layers={...state.layers};l.hiddenFrames=[...state.hiddenFrames];}
function applyLayout(){const l=currentLayout();state.layers={...l.layers};state.presentation=l.presentation;state.hiddenFrames=new Set(l.hiddenFrames);state.focus=l.presentation.context==='isolate';state.mode=workspace.task==='understand'?'construction':'joint';}
function switchTask(task:Task){if(workspace.task===task)return;saveLayout();workspace.task=task;playing=false;applyLayout();syncLayers();render();$('#task-inspector').scrollTop=0;}
function panel(name:'inspector'|'table'|'joints',open?:boolean){const l=currentLayout();l[name]=open??$('#'+panelIds[name]).hidden;if(l[name]&&narrowScreen.matches){for(const other of ['inspector','table','joints'] as const)if(other!==name)l[other]=false;}renderLayout();}
function renderLayout(){
 const l=currentLayout(),active=document.activeElement as HTMLElement;
 document.body.dataset.task=workspace.task;document.body.classList.toggle('canvas-focus',canvasFocus);document.body.classList.toggle('inspector-open',l.inspector&&!canvasFocus);
 document.querySelectorAll<HTMLButtonElement>('[data-task]').forEach(b=>b.setAttribute('aria-current',b.dataset.task===workspace.task?'page':'false'));
 document.querySelectorAll<HTMLElement>('[data-area]').forEach(el=>el.hidden=el.dataset.area!==workspace.task);
 const mobilePanel=narrowScreen.matches?(['inspector','table','joints'] as const).find(name=>l[name]):undefined;
 for(const name of ['inspector','table','joints'] as const)$('#'+panelIds[name]).hidden=canvasFocus||!l[name]||(mobilePanel!==undefined&&mobilePanel!==name);
 for(const name of ['inspector','table','joints'] as const){const button=$('#toggle-'+name);button.setAttribute('aria-expanded',String(!$('#'+panelIds[name]).hidden));}
 $('#toggle-inspector').textContent=$('#task-inspector').hidden?'Show details':'Hide details';
 $('#inspector-title').textContent=taskLabels[workspace.task];$('#model-context').textContent=state.chain.name;$('#model-context').title=state.chain.name;$('#chain-context').textContent=state.chain.base+' → '+(state.chain.joints.at(-1)?.child??state.chain.base);
 $('#chain-context').title=$('#chain-context').textContent??'';
 $('#canvas-focus').textContent=canvasFocus?'Exit focus':'Canvas focus';$('#canvas-focus').setAttribute('aria-pressed',String(canvasFocus));
 $('#selection-label').textContent=workspace.task==='understand'?'DH step':'Joint';$<HTMLSelectElement>('#joint-selector').value=String(state.selected);$<HTMLSelectElement>('#joint-selector').disabled=!state.model.rows.length;
 $('#step-context').textContent=workspace.task==='understand'&&state.model.rows.length?'F'+state.selected+' → F'+(state.selected+1)+' · '+(state.selected+1)+' / '+state.model.rows.length:'';
 $('#fit-pair').hidden=workspace.task!=='understand';$('#toggle-joints').textContent=workspace.task==='understand'?'Robot pose':'Joint controls';
 $('#joint-panel-title').textContent=workspace.task==='understand'?'Physical robot pose':'Move joint';
 document.querySelectorAll<HTMLElement>('[data-joint-row]').forEach(el=>el.hidden=!l.allJoints&&Number(el.dataset.jointRow)!==state.selected);
 $('#expand-joints').textContent=l.allJoints?'Selected joint only':'Expand all joints';$('#expand-joints').setAttribute('aria-pressed',String(l.allJoints));
 $<HTMLSelectElement>('#chain-context-mode').value=l.presentation.context;$<HTMLInputElement>('#all-parameters').checked=l.presentation.allParameters;$('#overlay-task').textContent='· '+taskLabels[workspace.task];
 if(active&&active!==document.body&&active.closest('[hidden]')){const owner=active.closest('#task-inspector,#table-dock,#joint-panel');const id=owner?.id;$(canvasFocus?'#canvas-focus':id==='table-dock'?'#toggle-table':id==='joint-panel'?'#toggle-joints':'#toggle-inspector').focus({preventScroll:true});}
}
let themePreference='system';try{const stored=localStorage.getItem('frame-lab-theme');if(stored&&['system','light','black'].includes(stored))themePreference=stored;}catch{}
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){const theme=themePreference==='system'?(systemTheme.matches?'black':'light'):themePreference;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme==='black'?'dark':'light';$<HTMLSelectElement>('#theme').value=themePreference;view?.setTheme(theme as 'light'|'black');}
systemTheme.addEventListener('change',()=>{if(themePreference==='system')applyTheme();});
document.addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
 if(b.dataset.task)switchTask(b.dataset.task as Task);
 if(b.dataset.files)files?.open(b.dataset.files as 'session');
 if(b.dataset.closePanel)panel(b.dataset.closePanel as 'inspector',false);
 if(b.hasAttribute('data-close-dialog'))b.closest('dialog')?.close();
 if(b.id.startsWith('toggle-'))panel(b.id.replace('toggle-','') as 'inspector');
 if(b.id==='canvas-focus'){canvasFocus=!canvasFocus;renderLayout();}
 if(b.id==='expand-joints'){currentLayout().allJoints=!currentLayout().allJoints;renderLayout();}
 if(b.id==='change-pose')panel('joints',true);
 if(b.id==='open-settings'){syncLayers();$<HTMLDialogElement>('#view-dialog').showModal();}
 if(b.id==='restore-defaults'){const defaults=taskDefaults(workspace.task);currentLayout().layers=defaults.layers;currentLayout().presentation=defaults.presentation;currentLayout().hiddenFrames=[];applyLayout();syncLayers();document.querySelectorAll<HTMLInputElement>('[data-frame]').forEach(e=>e.checked=true);render();}
});
document.addEventListener('change',event=>{const el=event.target as HTMLInputElement;
 if(el.id==='joint-selector')selectRow(Number(el.value));
 if(el.id==='theme'){themePreference=el.value;try{localStorage.setItem('frame-lab-theme',themePreference);}catch{}applyTheme();}
 if(el.id==='chain-context-mode'){currentLayout().presentation.context=el.value as 'isolate';applyLayout();render();}
 if(el.id==='all-parameters'){currentLayout().presentation.allParameters=el.checked;render();}
 if(el.id==='history-frames'){currentLayout().presentation.history=el.checked;render();}
 if(el.dataset.scope){currentLayout().presentation[el.dataset.scope as 'axisScope']=el.value as 'all';const layer=({axisScope:'axes',urdfScope:'urdf',dhScope:'dh'} as Record<string,string>)[el.dataset.scope];if(layer)state.layers[layer]=el.value!=='none';syncLayers();render();}
});
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]'))return;
 if(event.key==='Escape'&&canvasFocus){canvasFocus=false;renderLayout();$('#canvas-focus').focus();}
 if(event.key.toLowerCase()==='f'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();canvasFocus=!canvasFocus;renderLayout();$('#canvas-focus').focus();}
});
function selectRow(i:number){const next=Math.max(0,Math.min(state.model.rows.length-1,i));if(next===state.selected)return;state.selected=next;state.progress=0;playing=false;render();}
function setMode(mode:ViewState['mode']){playing=false;switchTask(mode==='construction'?'understand':'move');panel('inspector',true);render();}
function loadExample(id:string){
 const c=examples.find(c=>c.id===id);if(!c)return;
 loadChain(c);files?.resetSource(c);
}
function loadChain(c:Chain){
 const model=convertToDH(c);comparison?.reset();
 state.chain=c;state.model=model;state.q=initialPose(c);state.selected=0;state.progress=0;state.focus=false;state.mode='joint';state.hiddenFrames.clear();workspace=createWorkspace();canvasFocus=false;applyLayout();playing=false;sweepText='';$('#sweep-samples').textContent='Run the sweep to inspect each sample.';
 const select=$<HTMLSelectElement>('#example');select.replaceChildren(...examples.map(c=>new Option(c.name,c.id)));if(c.id==='custom')select.add(new Option(c.name+' · custom','custom'));select.value=c.id;
 $('#example-description').textContent=c.description;$('#lesson').textContent=c.lesson;$('#scene-title').textContent=c.name;$('#near-warning').hidden=!model.rows.some(r=>r.nearParallel);
 $('#individual-frames').innerHTML=model.referenceFrames.map((_,i)=>'<label><input type="checkbox" checked data-frame="f'+i+'"> DH F'+i+'</label>').join('')+c.joints.map(j=>'<label><input type="checkbox" checked data-frame="u'+escapeHTML(j.child)+'"> URDF '+escapeHTML(j.child)+'</label>').join('');
 $('#source-data').innerHTML=c.joints.map(j=>'<p><b>'+escapeHTML(j.name)+'</b> · '+j.type+'<br>'+escapeHTML(j.parent)+' → '+escapeHTML(j.child)+'<br>axis ['+j.axis.map(x=>num(x)).join(', ')+']</p><span>Parent → joint origin</span>'+matrix(j.origin)).join('');
 $('#boundary-matrices').innerHTML='<p><b>B</b> · base → F₀</p>'+matrix(model.base)+'<p><b>E</b> · Fₙ → tool</p>'+matrix(model.tool);
 buildSliders();render();view?.home();
}
function buildSliders(){
 $<HTMLSelectElement>('#joint-selector').replaceChildren(...state.model.rows.map((r,i)=>new Option('J'+(i+1)+' · '+r.joint,String(i))));
 $('#joint-controls').innerHTML=state.model.rows.length?state.model.rows.map((r,i)=>{
  const j=state.chain.joints.find(j=>j.name===r.joint)!,factor=r.type==='prismatic'||!state.degrees?1:180/Math.PI;
  const limits=motionRange(j),q=state.q[r.joint]??0;if(r.type==='continuous'){limits[0]=Math.min(limits[0],q);limits[1]=Math.max(limits[1],q);}
  return '<div class="joint-control" data-joint-row="'+i+'"><span><button type="button" data-select="'+i+'" title="'+escapeHTML(r.joint)+'">J'+(i+1)+'</button> '+(r.type==='prismatic'?'Slide':'Rotate')+' <output aria-live="off" data-q-label="'+escapeHTML(r.joint)+'"></output></span><input aria-label="'+escapeHTML(r.joint)+' position" data-joint="'+escapeHTML(r.joint)+'" type="range" min="'+limits[0]*factor+'" max="'+limits[1]*factor+'" step="'+(r.type==='prismatic'?.001:state.degrees?.1:.001)+'" value="'+q*factor+'"></div>';
 }).join(''):'<p class="muted">This path has no moving joints. Its fixed transform is preserved in the tool transform.</p>';
}
function restoreSession(session:LabSession){
 const c=extractChain(session.robot,session.selection.base,session.selection.tip,session.selection.tool);loadChain(c);
 Object.assign(state,{q:session.q,selected:session.view.selected,focus:session.view.focus,mode:session.view.mode,progress:session.view.progress,degrees:session.view.degrees,layers:{...session.view.layers},hiddenFrames:new Set(session.view.hiddenFrames)});
 workspace=session.view.workspace??migrateWorkspace(session.view);canvasFocus=false;applyLayout();
 $('#units').textContent=state.degrees?'Degrees':'Radians';
 document.querySelectorAll<HTMLInputElement>('[data-frame]').forEach(el=>el.checked=!state.hiddenFrames.has(el.dataset.frame!));
 syncLayers();buildSliders();render();if(session.view.camera)view?.restoreCamera(session.view.camera);else view?.home();
 $('#projection').textContent=view?.camera===view?.orthographic?'Orthographic':'Perspective';
}
function syncLayers(){document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(el=>el.checked=state.layers[el.dataset.layer!]!==false);document.querySelectorAll<HTMLSelectElement>('[data-scope]').forEach(el=>el.value=currentLayout().presentation[el.dataset.scope as 'axisScope']);$<HTMLInputElement>('#history-frames').checked=currentLayout().presentation.history;document.querySelectorAll<HTMLInputElement>('[data-frame]').forEach(el=>el.checked=!state.hiddenFrames.has(el.dataset.frame!));}
function render(){
 const row=state.model.rows[state.selected],hasRows=!!row;
 renderLayout();
 document.querySelectorAll<HTMLButtonElement>('#focus,#previous-row,#next-row,[data-look],#fit-pair,#all-parameters,#play,#next-step,#previous-step,#restart').forEach(b=>b.disabled=!hasRows);
 if(!hasRows){state.focus=false;state.mode='joint';}
 $('#scene-status').textContent=state.focus?'Pair F'+state.selected+' → F'+(state.selected+1)+' · other joints hidden':state.model.rows.length+' moving joints · '+state.chain.joints.filter(j=>j.type==='fixed').length+' fixed adapters';
 if(row){
 const q=state.q[row.joint]??0,v=evaluated(row,q);
 $('#pair-title').textContent='F'+state.selected+' → F'+(state.selected+1);$('#target-frame').textContent=String(state.selected+1);
 $('#focus').textContent=state.focus?'Show whole chain':'Isolate this pair';$('#focus').setAttribute('aria-pressed',String(state.focus));
 $('#row-description').innerHTML='<span class="case-badge">'+row.axisCase+' axes</span><p>'+row.reason+'</p>';
 const tableFocus=document.activeElement?.closest<HTMLButtonElement>('#dh-rows button');const focusSelector=tableFocus?(tableFocus.dataset.select!==undefined?'[data-select="'+tableFocus.dataset.select+'"]':'[data-param="'+tableFocus.dataset.param+'"][data-row="'+tableFocus.dataset.row+'"]'):undefined;
 $('#dh-rows').innerHTML=state.model.rows.map((r,i)=>{const e=evaluated(r,state.q[r.joint]??0);return '<tr class="'+(i===state.selected?'selected':'')+'"><th scope="row"><button data-select="'+i+'" aria-label="Select joint '+(i+1)+'" aria-pressed="'+(i===state.selected)+'">J'+(i+1)+' <small>'+ (r.type==='prismatic'?'P':'R')+'</small></button></th>'+(['theta','d','a','alpha'] as const).map((key,k)=>'<td><button data-param="'+k+'" data-row="'+i+'" aria-label="Inspect '+key+' for joint '+(i+1)+'" class="'+((r.type==='prismatic'?key==='d':key==='theta')?'variable':'')+'">'+(key==='theta'||key==='alpha'?angle(e[key]):num(e[key]))+'</button></td>').join('')+'</tr>';}).join('');
 if(focusSelector)document.querySelector<HTMLButtonElement>('#dh-rows '+focusSelector)?.focus({preventScroll:true});
 const variable=row.type==='prismatic'?'d = '+num(row.d)+' m + q':'θ = '+angle(row.theta)+' + q';
 const values=[angle(v.theta),num(v.d)+' m',num(v.a)+' m',angle(v.alpha)];
 const active=Math.min(3,Math.floor(state.progress));
 const focusedParameter=document.activeElement?.closest<HTMLButtonElement>('.parameter-card')?.dataset.param;
 $('#parameter-cards').innerHTML='<p class="joint-formula">'+variable+' <span>q = '+(row.type==='prismatic'?num(q)+' m':angle(q))+'</span></p><div class="parameter-grid">'+['Rz(θ)','Tz(d)','Tx(a)','Rx(α)'].map((name,i)=>'<button aria-label="'+name+'" aria-pressed="'+(i===active)+'" data-param="'+i+'" data-row="'+state.selected+'" class="parameter-card '+(i===active?'active':'')+'"><span>'+name+'</span><strong '+(!currentLayout().presentation.allParameters&&i!==active?'hidden':'')+'>'+values[i]+'</strong><small '+(!currentLayout().presentation.allParameters&&i!==active?'hidden':'')+'>'+['Rotate about zᵢ₋₁','Slide along zᵢ₋₁','Slide along xᵢ','Rotate about xᵢ'][i]+'</small></button>').join('')+'</div>';
 if(focusedParameter!==undefined)document.querySelector<HTMLButtonElement>('.parameter-card[data-param="'+focusedParameter+'"]')?.focus({preventScroll:true});
 $('#construction-bar').hidden=state.mode!=='construction';$('#play').textContent=playing?'Pause':state.progress>=4?'Replay':'Play';
 $<HTMLInputElement>('#scrubber').value=String(state.progress);$('#progress-label').textContent=num(state.progress,1)+' / 4';
 const explanations=['Rotate the ghost frame about its z-axis. The directed arc shows θ.','Translate the ghost frame along its z-axis by d.','Translate along the new x direction by a, across the common normal.','Rotate about the new x-axis by α to align the z directions.'];
 $('#construction-explanation').textContent=state.progress>=4?'Complete: the constructed frame coincides with F'+(state.selected+1)+'.':explanations[Math.min(3,Math.floor(state.progress))]+(Math.abs([v.theta,v.d,v.a,v.alpha][Math.min(3,Math.floor(state.progress))])<1e-10?' This parameter is zero, so this step has no displacement.':'');
 }else{
 $('#pair-title').textContent='Fixed chain';$('#target-frame').textContent='0';
 $('#focus').textContent='No moving pair';$('#focus').setAttribute('aria-pressed','false');
 $('#dh-rows').innerHTML='<tr><td colspan="5">No moving DH rows</td></tr>';
 $('#row-description').innerHTML='<p>All transforms on this path are fixed. The base and tool transforms still reproduce the selected end-effector pose.</p>';
 $('#parameter-cards').replaceChildren();$('#construction-bar').hidden=true;
 }
 document.querySelectorAll<HTMLOutputElement>('[data-q-label]').forEach(el=>{const r=state.model.rows.find(r=>r.joint===el.dataset.qLabel)!;el.textContent=r.type==='prismatic'?num(state.q[r.joint]??0)+' m':angle(state.q[r.joint]??0);});
 const e=verifyPose(state.chain,state.model,state.q),ok=e.position<1e-7&&e.orientation<1e-7&&e.attachmentPosition<1e-7&&e.attachmentOrientation<1e-7;
 $('#verification-status').textContent=ok?'Models agree':'Check numerical precision';$('.verification').classList.toggle('warning',!ok);$('#precision-warning').hidden=ok;$('.check-icon').textContent=ok?'✓':'!';
 $('#tool-pose').innerHTML=matrix(urdfFK(state.chain,state.q).tip);
 $('#position-error').textContent=e.position.toExponential(1)+' m';$('#orientation-error').textContent=e.orientation.toExponential(1)+' rad';$('#attachment-error').textContent=e.attachmentPosition.toExponential(1)+' m';$('#attachment-angle-error').textContent=e.attachmentOrientation.toExponential(1)+' rad';
 $('#sweep-result').textContent=sweepText||'Independent URDF and DH forward kinematics.';
 saveLayout();view?.update(state);
}
function sweep(){const samples:string[]=[];let worstP=0,worstR=0,worstA=0,seed=3419;for(let i=0;i<150;i++){const q:Record<string,number>={};for(const r of state.model.rows){const j=state.chain.joints.find(j=>j.name===r.joint)!;seed=(1664525*seed+1013904223)>>>0;const t=i===0?0:i===1?1:seed/4294967296;const [lo,hi]=motionRange(j);q[r.joint]=lo+t*(hi-lo);}const e=verifyPose(state.chain,state.model,q);samples.push('<tr><td>'+(i+1)+'</td><td>'+Object.entries(q).map(([j,v])=>escapeHTML(j)+': '+num(v,4)).join('<br>')+'</td><td>'+e.position.toExponential(1)+'</td><td>'+e.orientation.toExponential(1)+'</td></tr>');worstP=Math.max(worstP,e.position);worstR=Math.max(worstR,e.orientation);worstA=Math.max(worstA,e.attachmentPosition,e.attachmentOrientation);}sweepText=(Math.max(worstP,worstR,worstA)<1e-7?'150 / 150 passed':'Numerical tolerance exceeded')+' · max '+worstP.toExponential(1)+' m / '+worstR.toExponential(1)+' rad. Includes joint-limit endpoints; numerical evidence, not a proof.';$('#sweep-samples').innerHTML='<p>q values use meters / radians.</p><div class="table-scroll"><table><thead><tr><th>Sample</th><th>q</th><th>Error m</th><th>Error rad</th></tr></thead><tbody>'+samples.join('')+'</tbody></table></div>';render();return {position:worstP,orientation:worstR,attachment:worstA};}

document.addEventListener('click',event=>{
 const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
 if(b.dataset.select!==undefined)selectRow(Number(b.dataset.select));
 if(b.dataset.param!==undefined){if(state.selected!==Number(b.dataset.row))selectRow(Number(b.dataset.row));state.progress=Number(b.dataset.param);setMode('construction');}
 if(b.dataset.look)view?.lookAlong(b.dataset.look as 'x'|'z');

 switch(b.id){
 case 'open-import':files?.open('import');break;
 case 'open-editor':files?.open('editor');break;
 case 'open-session':files?.open('session');break;
 case 'open-export':files?.open('export');break;
 case 'open-comparison':comparison?.open();break;
 case 'focus':currentLayout().presentation.context=state.focus?'whole':'isolate';applyLayout();render();break;
 case 'previous-row':selectRow(state.selected-1);break;
 case 'next-row':selectRow(state.selected+1);break;
 case 'projection':b.textContent=view?.projection()?'Orthographic':'Perspective';break;
 case 'fit':view?.fit(false,true);break;
 case 'fit-pair':view?.fit(false,false,true);break;
 case 'fit-all':view?.fit(true);break;
 case 'units':state.degrees=!state.degrees;b.textContent=state.degrees?'Degrees':'Radians';buildSliders();render();break;
 case 'reset':state.q=initialPose(state.chain);playing=false;buildSliders();render();break;
 case 'play':if(state.progress>=4)state.progress=0;playing=!playing;render();break;
 case 'restart':state.progress=0;playing=false;render();break;
 case 'previous-step':state.progress=Math.max(0,Math.ceil(state.progress)-1);playing=false;render();break;
 case 'next-step':state.progress=Math.min(4,Math.floor(state.progress)+1);playing=false;render();break;
 case 'sweep':sweep();break;
 case 'convention-toggle':$<HTMLDialogElement>('#help-dialog').showModal();break;
 }
});
document.addEventListener('change',event=>{const el=event.target as HTMLInputElement;if(el.id==='example')loadExample(el.value);if(el.dataset.layer){const layer=el.dataset.layer;state.layers[layer]=el.checked;const scope=({axes:'axisScope',urdf:'urdfScope',dh:'dhScope'} as const)[layer as 'axes'];if(scope){const p=currentLayout().presentation;if(!el.checked)p[scope]='none';else if(p[scope]==='none')p[scope]=taskDefaults(workspace.task).presentation[scope];}syncLayers();render();}if(el.dataset.frame){if(el.checked)state.hiddenFrames.delete(el.dataset.frame);else state.hiddenFrames.add(el.dataset.frame);render();}});
document.addEventListener('input',event=>{const el=event.target as HTMLInputElement;if(el.dataset.joint){const row=state.model.rows.find(r=>r.joint===el.dataset.joint)!;state.q[row.joint]=Number(el.value)*(row.type==='prismatic'||!state.degrees?1:Math.PI/180);playing=false;render();}if(el.id==='scrubber'){state.progress=Number(el.value);playing=false;render();}});
try{view=new RobotView($('#viewport'),selectRow);}catch(error){$('#viewport').innerHTML='<div class="webgl-error"><b>3D rendering is unavailable.</b><p>Enable WebGL or hardware acceleration in your browser. The DH table and numerical verification still work.</p></div>';console.error(error);}
new ResizeObserver(entries=>{document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px');}).observe($('.topbar'));
comparison=createComparison(()=>state,()=>{playing=false;render();});
applyTheme();loadExample(examples[0].id);
files=createFileWorkflow({getState:()=>state,loadChain,camera:()=>view?.cameraSnapshot(),loadSession:restoreSession,workspace:()=>{saveLayout();return structuredClone(workspace);},pause:()=>{playing=false;render();}});
function animate(time:number){if(playing){const elapsed=Math.min(.05,(time-lastTime)/1000);state.progress=Math.min(4,state.progress+elapsed*.55);if(state.progress>=4)playing=false;render();}lastTime=time;requestAnimationFrame(animate);}requestAnimationFrame(animate);

// Feature-detected page tools use exactly the same actions as the visible controls.
type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
const lifecycle=new AbortController();
const readState=()=>({example:state.chain.id,selectedRow:state.selected+1,mode:state.mode,progress:state.progress,focus:state.focus,q:{...state.q},errors:verifyPose(state.chain,state.model,state.q)});
const tools:Tool[]=[
 {name:'read_kinematics_lab',description:'Read the selected mechanism, joint positions, DH step, and independent verification errors.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>readState()},
 {name:'configure_kinematics_lab',description:'Choose a built-in mechanism and DH row; optionally isolate it and set joint positions in radians or meters.',inputSchema:{type:'object',properties:{example:{type:'string',enum:examples.map(c=>c.id)},row:{type:'integer',minimum:1},focus:{type:'boolean'},q:{type:'object',additionalProperties:{type:'number'}}},required:['example','row'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:unknown)=>{
  if(!input||typeof input!=='object')throw Error('Expected configuration.');const x=input as {example:string;row:number;focus?:boolean;q?:Record<string,number>},chain=examples.find(c=>c.id===x.example);
  if(!chain)throw Error('Unknown example.');const model=convertToDH(chain);if(!Number.isInteger(x.row)||x.row<1||x.row>model.rows.length)throw Error('Invalid row.');
  if(x.focus!==undefined&&typeof x.focus!=='boolean')throw Error('Focus must be boolean.');if(x.q!==undefined&&(!x.q||typeof x.q!=='object'||Array.isArray(x.q)))throw Error('Expected joint positions.');
  for(const [name,value] of Object.entries(x.q??{})){const j=chain.joints.find(j=>j.name===name&&j.type!=='fixed');if(!j||!Number.isFinite(value)||j.limits&&(value<j.limits[0]||value>j.limits[1]))throw Error('Invalid joint position.');}
  loadExample(chain.id);$<HTMLSelectElement>('#example').value=chain.id;state.q={...initialPose(chain),...x.q};currentLayout().presentation.context=x.focus?'isolate':'whole';state.focus=x.focus??false;selectRow(x.row-1);buildSliders();render();view?.fit();return readState();
 }}
];
if(context)for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser proposal; normal UI remains available. */}}
window.addEventListener('pagehide',()=>{lifecycle.abort();view?.dispose();});
// Public diagnostics contain derived numeric results only, useful for local QA.
Object.defineProperty(window,'frameLab',{value:{readState,verify:sweep,getVisualMetrics:()=>view?.getVisualMetrics(),getJointVisuals:()=>view?.getJointVisuals(),getCamera:()=>view?.cameraSnapshot(),getPresentation:()=>({workspace:structuredClone(workspace),canvasFocus,theme:document.documentElement.dataset.theme}),getRenderState:()=>view?.getRenderState(),getCursorAnchor:(x:number,y:number)=>view?.cursorAnchor(x,y),projectWorld:(p:[number,number,number])=>view?.projectWorld(p),getToolPositions:()=>({urdf:position(urdfFK(state.chain,state.q).tip),dh:position(dhFK(state.model,state.q).tip)})}});
