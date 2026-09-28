/** Presentation-only preferences. Robot coordinates and construction progress live separately. */
export const tasks=['model','move','understand','check'] as const;
export type Task=typeof tasks[number];
export type Scope='selected'|'all'|'none';
export interface Presentation {context:'isolate'|'fade'|'whole';urdfScope:Scope;dhScope:Scope;axisScope:Scope;labelScope:Scope;allParameters:boolean;history:boolean}
export interface TaskLayout {inspector:boolean;table:boolean;joints:boolean;allJoints:boolean;layers:Record<string,boolean>;presentation:Presentation;hiddenFrames:string[]}
export interface Workspace {task:Task;tasks:Record<Task,TaskLayout>}
export function taskDefaults(task:Task):TaskLayout {
 const dh=task==='understand';
 return {inspector:task!=='move',table:false,joints:task==='move',allJoints:false,
 layers:{links:true,glyphs:true,guides:true,grid:true,axes:task==='move'||dh,urdf:false,dh,normals:dh,dimensions:dh,ghost:dh,tool:false},
 presentation:{context:dh?'isolate':'whole',urdfScope:'all',dhScope:'selected',axisScope:'selected',labelScope:'selected',allParameters:false,history:false},hiddenFrames:[]};
}
export function createWorkspace():Workspace{return {task:'move',tasks:Object.fromEntries(tasks.map(t=>[t,taskDefaults(t)])) as Record<Task,TaskLayout>};}
export function readWorkspace(input:unknown):Workspace {
 const bad=()=>{throw Error('Invalid workspace preferences.');};
 if(!input||typeof input!=='object')return bad();const w=input as Workspace;
 if(!tasks.includes(w.task)||!w.tasks||typeof w.tasks!=='object')return bad();
 const result=createWorkspace();result.task=w.task;
 for(const t of tasks){const s=w.tasks[t],out=result.tasks[t];if(!s||typeof s!=='object'||!s.presentation||!s.layers)return bad();
  for(const k of ['inspector','table','joints','allJoints'] as const){if(typeof s[k]!=='boolean')return bad();out[k]=s[k];}
  for(const k of Object.keys(out.layers)){if(typeof s.layers[k]!=='boolean')return bad();out.layers[k]=s.layers[k];}
  const p=s.presentation;if(!['isolate','fade','whole'].includes(p.context))return bad();out.presentation.context=p.context;
  for(const k of ['urdfScope','dhScope','axisScope','labelScope'] as const){if(!['selected','all','none'].includes(p[k]))return bad();out.presentation[k]=p[k];}
  for(const k of ['allParameters','history'] as const){if(typeof p[k]!=='boolean')return bad();out.presentation[k]=p[k];}
  if(!Array.isArray(s.hiddenFrames)||s.hiddenFrames.length>1000||!s.hiddenFrames.every(f=>typeof f==='string'))return bad();out.hiddenFrames=[...s.hiddenFrames];
 }return result;
}
export function migrateWorkspace(view:{mode:'joint'|'construction';focus:boolean;layers:Record<string,boolean>;hiddenFrames:string[]}):Workspace {
 const w=createWorkspace();w.task=view.mode==='construction'?'understand':'move';const t=w.tasks[w.task];
 t.layers={...t.layers,...view.layers};t.hiddenFrames=[...view.hiddenFrames];t.presentation={...t.presentation,context:view.focus?'isolate':'whole',urdfScope:'all',dhScope:'all',axisScope:'all',labelScope:'all',allParameters:true,history:true};return w;
}
