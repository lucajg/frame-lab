// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {createWorkspace,migrateWorkspace,readWorkspace} from '../src/core/workspace';
import {parseSession,serializeSession,type LabSession} from '../src/core/session';
import {robotFromChain,initialPose} from '../src/core/robot';
import {examples} from '../src/core/examples';
import {sceneThemes} from '../src/theme';
function session():LabSession {const c=examples[0],workspace=createWorkspace();return {format:'frame-lab-session',version:2,robot:robotFromChain(c),selection:{base:c.base,tip:c.joints.at(-1)!.child,tool:c.tool},q:initialPose(c),view:{selected:0,focus:false,mode:'joint',progress:0,degrees:true,layers:workspace.tasks.move.layers,hiddenFrames:[],workspace}};}
describe('workspace persistence',()=>{
 it('keeps per-task layouts and visibility independent',()=>{const w=createWorkspace();w.tasks.move.layers.grid=false;w.tasks.move.hiddenFrames.push('f0');w.tasks.move.table=true;expect(w.tasks.understand.layers.grid).toBe(true);expect(w.tasks.understand.hiddenFrames).toEqual([]);expect(w.tasks.understand.table).toBe(false);});
 it('round trips version 2 layout, context, scopes, panel states and history',()=>{const s=session(),w=s.view.workspace!;w.task='understand';w.tasks.understand.presentation.context='fade';w.tasks.understand.presentation.allParameters=true;w.tasks.understand.presentation.history=true;w.tasks.understand.presentation.urdfScope='selected';w.tasks.understand.hiddenFrames=['f1'];w.tasks.understand.inspector=false;w.tasks.move.allJoints=true;s.view.progress=2.4;expect(parseSession(serializeSession(s))).toEqual(s);});
 it('migrates v1 joint mode without losing the old overlays or frame visibility',()=>{const s=session();s.version=1;delete s.view.workspace;s.view.layers.dh=true;s.view.hiddenFrames=['f0'];const loaded=parseSession(JSON.stringify(s));expect(loaded.view.workspace!.task).toBe('move');expect(loaded.view.workspace!.tasks.move.layers.dh).toBe(true);expect(loaded.view.workspace!.tasks.move.presentation.dhScope).toBe('all');expect(loaded.view.workspace!.tasks.move.hiddenFrames).toEqual(['f0']);});
 it('maps old construction/isolation and exposes the previous four-parameter view',()=>{const w=migrateWorkspace({mode:'construction',focus:true,layers:{dimensions:true},hiddenFrames:[]});expect(w.task).toBe('understand');expect(w.tasks.understand.presentation).toMatchObject({context:'isolate',allParameters:true,history:true});});
 it.each([(w:any)=>w.task='bogus',(w:any)=>w.tasks.move.layers.grid='yes',(w:any)=>w.tasks.move.presentation.context='bad',(w:any)=>w.tasks.move.presentation.dhScope='sometimes',(w:any)=>w.tasks.move.joints=1,(w:any)=>w.tasks.move.hiddenFrames=[1]])('rejects malformed preferences (%#)',mutate=>{const w=createWorkspace();mutate(w);expect(()=>readWorkspace(w)).toThrow('Invalid workspace');});
 it('rejects nonexistent hidden frames in inactive tasks',()=>{const s=session();s.view.workspace!.tasks.check.hiddenFrames=['missing'];expect(()=>parseSession(JSON.stringify(s))).toThrow('Unknown hidden frame');});
 it('does not import theme preferences from shared sessions',()=>{const s=session();(s.view.workspace as any).theme='black';expect((parseSession(JSON.stringify(s)).view.workspace as any).theme).toBeUndefined();});
});
function luminance(hex:number){const rgb=[16,8,0].map(shift=>(hex>>shift&255)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:number,b:number){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
describe('scene theme contrast',()=>{for(const [name,t] of Object.entries(sceneThemes))it(name+' keeps RGB axes and annotations distinguishable from the canvas',()=>{for(const c of [t.x,t.y,t.z,t.gold,t.teal,t.guide])expect(contrast(c,t.background)).toBeGreaterThan(3);});});
