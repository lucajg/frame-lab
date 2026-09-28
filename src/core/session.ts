import {type Workspace,readWorkspace,migrateWorkspace} from './workspace';
import {type Robot,readRobot,extractChain,record,numbers,MAX_FILE_BYTES} from './robot';
import {type Chain} from './urdf';
import {convertToDH,evaluated} from './dh';
import {type Vec3,norm,sub} from './math';

export const layerKeys=['links','axes','urdf','dh','normals','dimensions','ghost','tool'] as const;
export interface CameraSnapshot {projection:'perspective'|'orthographic';position:Vec3;target:Vec3;up:Vec3;zoom:number;halfHeight:number}
export interface SessionView {selected:number;focus:boolean;mode:'joint'|'construction';progress:number;degrees:boolean;layers:Record<string,boolean>;hiddenFrames:string[];camera?:CameraSnapshot;workspace?:Workspace}
export interface LabSession {format:'frame-lab-session';version:1|2;robot:Robot;selection:{base:string;tip:string;tool:number[]};q:Record<string,number>;view:SessionView}
function boolean(value:unknown,label:string):boolean{if(typeof value!=='boolean')throw Error(label+' must be boolean.');return value;}
function scalar(value:unknown,min:number,max:number,label:string):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label+'.');return value;}
export function readCamera(value:unknown):CameraSnapshot{
 const r=record(value,'Camera');if(r.projection!=='perspective'&&r.projection!=='orthographic')throw Error('Invalid camera projection.');
 const position=numbers(r.position,3,'Camera position') as Vec3,target=numbers(r.target,3,'Camera target') as Vec3,up=numbers(r.up,3,'Camera up') as Vec3;
 if(norm(sub(position,target))<1e-8||norm(up)<1e-10)throw Error('Invalid camera orientation.');
 return {projection:r.projection,position,target,up,zoom:scalar(r.zoom,1e-8,1e8,'camera zoom'),halfHeight:scalar(r.halfHeight,1e-8,1e9,'camera height')};
}
export function validatePose(chain:Chain,value:unknown):Record<string,number>{
 const source=record(value,'Joint positions'),q:Record<string,number>=Object.create(null),active=chain.joints.filter(j=>j.type!=='fixed');
 for(const key of Object.keys(source))if(!active.some(j=>j.name===key))throw Error('Unknown moving joint in session: '+key);
 for(const j of active){const v=source[j.name];if(typeof v!=='number'||!Number.isFinite(v))throw Error('Missing or invalid position for '+j.name);if(j.type!=='continuous'&&j.limits&&(v<j.limits[0]-1e-12||v>j.limits[1]+1e-12))throw Error('Position outside limits for '+j.name);q[j.name]=v;}return q;
}
export function parseSession(text:string):LabSession{
 if(new TextEncoder().encode(text).length>MAX_FILE_BYTES)throw Error('Session files must be 2 MB or smaller.');
 let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw Error('Invalid session JSON.');}
 const data=record(parsed,'Session');if(data.format!=='frame-lab-session'||![1,2].includes(data.version as number))throw Error('Unsupported session format/version.');
 const robot=readRobot(data.robot),s=record(data.selection,'Selection');
 if(typeof s.base!=='string'||typeof s.tip!=='string')throw Error('Invalid chain selection.');
 const selection={base:s.base,tip:s.tip,tool:numbers(s.tool,16,'Tool transform')},chain=extractChain(robot,selection.base,selection.tip,selection.tool),model=convertToDH(chain),q=validatePose(chain,data.q),r=record(data.view,'View');
 const selected=scalar(r.selected,0,Math.max(0,model.rows.length-1),'selected row');if(!Number.isInteger(selected))throw Error('Invalid selected row.');
 if(r.mode!=='joint'&&r.mode!=='construction')throw Error('Invalid interaction mode.');
 const layersInput=record(r.layers,'Layers'),layers:Record<string,boolean>={};for(const key of [...layerKeys,...(data.version===2?['glyphs','guides','grid']:[])])layers[key]=boolean(layersInput[key],key+' visibility');
 if(!Array.isArray(r.hiddenFrames)||!r.hiddenFrames.every(x=>typeof x==='string'))throw Error('Invalid frame visibility.');
 const validFrames=new Set([...model.referenceFrames.map((_,i)=>'f'+i),...chain.joints.map(j=>'u'+j.child)]);
 if(r.hiddenFrames.some(x=>!validFrames.has(x)))throw Error('Unknown hidden frame.');
 const view:SessionView={selected,focus:boolean(r.focus,'Focus')&&model.rows.length>0,mode:model.rows.length?r.mode:'joint',progress:scalar(r.progress,0,4,'construction progress'),degrees:boolean(r.degrees,'Angle units'),layers,hiddenFrames:r.hiddenFrames as string[]};
 if(r.camera!==undefined)view.camera=readCamera(r.camera);
 view.workspace=data.version===2?readWorkspace(r.workspace):migrateWorkspace(view);
 for(const layout of Object.values(view.workspace.tasks))if(layout.hiddenFrames.some(f=>!validFrames.has(f)))throw Error('Unknown hidden frame in workspace.');
 return {format:'frame-lab-session',version:data.version as 1|2,robot,selection,q,view};
}
export function serializeSession(session:LabSession):string{
 const text=JSON.stringify(session,null,2);parseSession(text);return text;
}
export function exportDH(chain:Chain,q:Record<string,number>){
 const model=convertToDH(chain);
 return {format:'frame-lab-dh',version:1,robot:chain.name,baseLink:chain.base,tipLink:chain.joints.at(-1)?.child??chain.base,
 convention:'standard DH',equation:'T_URDF(q) = B * product(Rz(theta_i) Tz(d_i) Tx(a_i) Rx(alpha_i)) * E',
 units:{length:'meter',angle:'radian'},matrixLayout:'row-major; column vectors; child-to-parent transforms',referenceConfiguration:'All source joint coordinates q = 0, independently of motion limits',
 baseTransform:model.base,toolTransform:model.tool,sourceToolOffset:chain.tool,sourceJoints:chain.joints,
 rows:model.rows.map((r,i)=>({index:i+1,sourceJoint:r.joint,sourceChildLink:r.child,type:r.type,axisCase:r.axisCase,theta0:r.theta,d0:r.d,a:r.a,alpha:r.alpha,qSign:r.sign,variable:r.type==='prismatic'?'d = d0 + qSign * q':'theta = theta0 + qSign * q',limits:chain.joints.find(j=>j.name===r.joint)?.limits??null,frameAttachment:r.attachment})),
 currentConfiguration:{q:{...q},evaluatedRows:model.rows.map(r=>evaluated(r,q[r.joint]??0))}};
}
