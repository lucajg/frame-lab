import {compareDH,parseParameterRows,parseTransform,referenceComparison} from './core/comparison';
import {numeric} from './core/robot';
import {identity,type Mat4} from './core/math';
import {type DHModel} from './core/dh';
import {type Chain} from './core/urdf';
import {escapeHTML} from './files-ui';

type State={chain:Chain;model:DHModel;q:Record<string,number>};
const keys=['theta','d','a','alpha'] as const;
const transformText=(m:Mat4)=>Array.from({length:4},(_,i)=>m.slice(i*4,i*4+4).join(' ')).join('\n');
const errorText=(n:number,unit:string)=>n.toExponential(3)+' '+unit;

export function createComparison(getState:()=>State,pause:()=>void){
 const dialog=document.createElement('dialog');dialog.id='comparison-dialog';dialog.setAttribute('aria-labelledby','comparison-title');
 dialog.innerHTML=`<div class="dialog-heading"><h2 id="comparison-title">Compare your DH parameters</h2><button data-close-dialog>Close</button></div>
 <p id="comparison-context" class="muted"></p>
 <p class="dialog-copy">Enter your <b>standard DH</b> parameters at <b>q = 0</b>. Compare the tool position and orientation with the app’s model, using the same source joint coordinates.</p>
 <p class="math">Aᵢ = Rz(θᵢ) Tz(dᵢ) Tx(aᵢ) Rx(αᵢ) · T = B A₁ … Aₙ E</p>
 <div class="comparison-actions"><label>Parameter angles<select id="comparison-units"><option value="radians">Radians</option><option value="degrees">Degrees</option></select></label><button id="comparison-copy">Use computed model</button></div>
 <p class="muted">Inputs are your values; “App” shows the computed reference. Lengths are in meters. Each row follows the named joint. R: θ = θ₀ + sign × q. P: d = d₀ + sign × q. Modified DH is not supported.</p>
 <div class="table-scroll" tabindex="0" role="region" aria-label="Editable DH parameters"><table class="comparison-table"><thead><tr><th scope="col">Joint / type</th><th scope="col">θ₀ <span data-angle-unit>rad</span></th><th scope="col">d₀ <small>m</small></th><th scope="col">a <small>m</small></th><th scope="col">α <span data-angle-unit>rad</span></th><th scope="col">q sign</th></tr></thead><tbody id="comparison-rows"></tbody></table></div>
 <details><summary>Paste a parameter table</summary><label for="comparison-paste">One row per moving joint: θ₀, d₀, a, α. Separate values with commas, spaces, or tabs; omit headers. Use the angle units selected above.</label><textarea id="comparison-paste" rows="4" spellcheck="false" placeholder="0, 0.4, 1.2, 0"></textarea><button id="comparison-apply-paste">Apply pasted rows</button></details>
 <details id="comparison-boundaries"><summary>Base & tool transforms (B and E)</summary><p>Initially copied from the app. If your DH frames differ, enter the transforms that connect your F₀ and Fₙ to the same source base and tool. Use 4 × 4 rigid matrices in row order, with translations in meters.</p><div class="comparison-transforms"><label>Base transform B<textarea id="comparison-base" rows="4" spellcheck="false"></textarea></label><label>Tool transform E<textarea id="comparison-tool" rows="4" spellcheck="false"></textarea></label></div><div class="comparison-actions"><button id="comparison-identity">Use identity transforms</button><button id="comparison-copy-transforms">Use computed transforms</button></div></details>
 <p class="muted">Tolerance: 1e−7 m position and 1e−7 rad orientation. Checks the current pose, q = 0, and 150 reproducible configurations within joint limits (including both limit endpoints; continuous joints use the displayed range). Agreement is numerical evidence, not a proof of equivalence.</p>
 <button id="comparison-run" class="primary">Compare 152 configurations</button><p id="comparison-message" role="status" aria-live="polite"></p><div id="comparison-result" hidden></div>`;
 document.body.append(dialog);
 const $=<T extends HTMLElement=HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
 let initialized=false,degrees=false;
 const invalidate=()=>{$('#comparison-result').hidden=true;$('#comparison-message').textContent='Parameters changed. Run the comparison again.';$('#comparison-message').classList.remove('error');};
 const showError=(error:unknown)=>{$('#comparison-result').hidden=true;$('#comparison-message').textContent=error instanceof Error?error.message:String(error);$('#comparison-message').classList.add('error');};
 const valueText=(value:number,key:typeof keys[number])=>String(value*(degrees&&(key==='theta'||key==='alpha')?180/Math.PI:1));
 function copyTransforms(){const {model}=getState();$<HTMLTextAreaElement>('#comparison-base').value=transformText(model.base);$<HTMLTextAreaElement>('#comparison-tool').value=transformText(model.tool);}
 function updateReferences(){
  const {model}=getState();
  dialog.querySelectorAll<HTMLElement>('[data-angle-unit]').forEach(el=>el.textContent=degrees?'deg':'rad');
  model.rows.forEach((row,i)=>keys.forEach(key=>{$(`[data-reference="${i}-${key}"]`).textContent='App '+Number(valueText(row[key],key)).toPrecision(7);}));
 }
 function reset(){
  const {chain,model}=getState();
  $('#comparison-context').textContent=chain.name+' · '+chain.base+' → '+(chain.joints.at(-1)?.child??chain.base);
  $('#comparison-rows').innerHTML=model.rows.length?model.rows.map((row,i)=>`<tr><th scope="row">J${i+1} · ${row.type==='prismatic'?'P':'R'}<small>${escapeHTML(row.joint)}</small></th>${keys.map(key=>`<td><input type="number" step="any" data-row="${i}" data-key="${key}" aria-label="Joint ${i+1} ${key}" value="${valueText(row[key],key)}"><small data-reference="${i}-${key}"></small></td>`).join('')}<td><select data-sign="${i}" aria-label="Joint ${i+1} sign"><option value="1">+1</option><option value="-1">−1</option></select></td></tr>`).join(''):'<tr><td colspan="6">Fixed chain: compare B · E. There are no moving DH rows.</td></tr>';
  copyTransforms();updateReferences();$('#comparison-result').hidden=true;$('#comparison-message').classList.remove('error');$('#comparison-message').textContent='Computed values loaded as a starting point. Edit them or paste your own table.';initialized=true;
 }
 function run(){
  const state=getState(),candidate=referenceComparison(state.model);
  candidate.rows=candidate.rows.map((row,i)=>({...row,...Object.fromEntries(keys.map(key=>{
   const value=numeric($<HTMLInputElement>(`[data-row="${i}"][data-key="${key}"]`).value,'Joint '+(i+1)+' '+key);
   return [key,value/(degrees&&(key==='theta'||key==='alpha')?180/Math.PI:1)];
  })),sign:Number($<HTMLSelectElement>(`[data-sign="${i}"]`).value) as 1|-1}));
  candidate.base=parseTransform($<HTMLTextAreaElement>('#comparison-base').value,'Base transform B');
  candidate.tool=parseTransform($<HTMLTextAreaElement>('#comparison-tool').value,'Tool transform E');
  const result=compareDH(state.chain,state.model,candidate,state.q);
  $('#comparison-message').classList.remove('error');$('#comparison-message').textContent=result.passed?'Agreement within tolerance at all 152 tested configurations.':'Differences found: '+result.passedCount+' / 152 configurations agree within tolerance.';
  $('#comparison-result').innerHTML=`<div class="comparison-summary ${result.passed?'':'warning'}"><h3>${result.passed?'Numerically consistent':'Parameters do not match across tested poses'}</h3><dl><div><dt>Current position error</dt><dd>${errorText(result.current.position,'m')}</dd></div><div><dt>Current orientation error</dt><dd>${errorText(result.current.orientation,'rad')}</dd></div><div><dt>Maximum position error</dt><dd>${errorText(result.maxPosition,'m')}</dd></div><div><dt>Maximum orientation error</dt><dd>${errorText(result.maxOrientation,'rad')}</dd></div></dl></div><p class="muted">${result.passed?'Different DH frames may produce the same tool motion. Individual parameter equality is not required.':'Check the angle units, q = 0 offsets, joint signs, and base/tool transforms. Matching only one pose does not establish matching motion.'}</p><details><summary>Inspect all configurations and errors</summary><p>Source q values are in radians for rotating joints and meters for sliding joints. The current pose is captured when you press Compare.</p><div class="table-scroll comparison-samples"><table><thead><tr><th>Configuration</th><th>q (joint order)</th><th>Position (m)</th><th>Orientation (rad)</th><th>Result</th></tr></thead><tbody>${result.samples.map(sample=>`<tr><th scope="row">${sample.label}</th><td>${state.model.rows.map(row=>(sample.q[row.joint]??0).toPrecision(6)).join(', ')||'—'}</td><td>${sample.position.toExponential(3)}</td><td>${sample.orientation.toExponential(3)}</td><td>${sample.passed?'Pass':'Mismatch'}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#comparison-result').hidden=false;$('#comparison-result').scrollIntoView({block:'nearest'});
 }
 dialog.addEventListener('input',event=>{if((event.target as HTMLElement).matches('input,textarea'))invalidate();});
 dialog.addEventListener('change',event=>{
  const el=event.target as HTMLSelectElement;
  if(el.id==='comparison-units'){
   try{
    const fields=[...dialog.querySelectorAll<HTMLInputElement>('[data-key="theta"],[data-key="alpha"]')];
    const values=fields.map(input=>numeric(input.value,input.getAttribute('aria-label')!));
    degrees=el.value==='degrees';fields.forEach((input,i)=>input.value=String(values[i]*(degrees?180/Math.PI:Math.PI/180)));updateReferences();invalidate();
   }catch(error){el.value=degrees?'degrees':'radians';showError(error);}
  }else if(el.matches('[data-sign]'))invalidate();
 });
 dialog.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest('button');if(!button)return;
  try{
   switch(button.id){
    case 'comparison-copy':reset();break;
    case 'comparison-copy-transforms':copyTransforms();invalidate();break;
    case 'comparison-identity':for(const id of ['base','tool'])$<HTMLTextAreaElement>('#comparison-'+id).value=transformText(identity());invalidate();break;
    case 'comparison-run':run();break;
    case 'comparison-apply-paste':{
     const rows=parseParameterRows($<HTMLTextAreaElement>('#comparison-paste').value,getState().model.rows.length,degrees);
     rows.forEach((row,i)=>keys.forEach(key=>$<HTMLInputElement>(`[data-row="${i}"][data-key="${key}"]`).value=valueText(row[key],key)));invalidate();$('#comparison-message').textContent='Pasted parameters applied. Joint signs and base/tool transforms retained.';break;
    }
   }
  }catch(error){showError(error);}
 });
 return {open(){pause();if(!initialized)reset();else if(!$('#comparison-result').hidden)invalidate();dialog.showModal();},reset(){initialized=false;$<HTMLTextAreaElement>('#comparison-paste').value='';}};
}
