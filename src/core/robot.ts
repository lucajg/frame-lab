import {identity,origin,position,type Mat4,type Vec3} from './math';
import {type Chain,type Joint,type JointType,validate,assertRigid} from './urdf';

export interface Robot {name:string;links:string[];joints:Joint[];root:string;warnings:string[]}
export const MAX_FILE_BYTES=2_000_000;
export const TYPES:JointType[]=['revolute','continuous','prismatic','fixed'];
export function named(value:unknown,label:string):string {
 if(typeof value!=='string'||!value.trim()||value.length>200)throw Error(label+' must be a nonempty name (at most 200 characters).');
 return value;
}
export function numbers(value:unknown,count:number,label:string):number[]{
 if(!Array.isArray(value)||value.length!==count||!value.every(x=>typeof x==='number'&&Number.isFinite(x)))throw Error(label+' must contain '+count+' finite numbers.');
 return [...value];
}
export function triple(value:string,label:string,fallback?:Vec3):Vec3 {
 if(!value.trim()&&fallback)return [...fallback];
 const parts=value.trim().split(/\s+/);
 if(parts.length!==3||parts.some(p=>!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(p)))throw Error(label+' requires three space-separated numbers.');
 return numbers(parts.map(Number),3,label) as Vec3;
}
export function numeric(value:string,label:string):number {
 if(!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim())||!Number.isFinite(Number(value)))throw Error(label+' must be a finite number.');
 return Number(value);
}
export function record(value:unknown,label:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be an object.');
 return value as Record<string,unknown>;
}
export function readJoint(value:unknown):Joint {
 const r=record(value,'Joint'),type=r.type as JointType;
 if(!TYPES.includes(type))throw Error('Unsupported joint type: '+String(type)+'. Use fixed, revolute, continuous, or prismatic joints.');
 const joint:Joint={name:named(r.name,'Joint name'),parent:named(r.parent,'Parent link'),child:named(r.child,'Child link'),type,origin:numbers(r.origin,16,'Joint origin'),axis:numbers(r.axis,3,'Joint axis') as Vec3};
 if(r.limits!==undefined)joint.limits=numbers(r.limits,2,'Joint limits') as [number,number];
 validate({id:'validation',name:'validation',description:'',lesson:'',base:joint.parent,joints:[joint],tool:identity()});
 return joint;
}
export function readRobot(value:unknown):Robot {
 const r=record(value,'Robot');
 if(!Array.isArray(r.links)||!r.links.length||r.links.length>501||!Array.isArray(r.joints)||r.joints.length>500)throw Error('A robot must have 1–501 links and at most 500 joints.');
 const links=r.links.map(l=>named(l,'Link name')),joints=r.joints.map(readJoint),set=new Set(links);
 if(set.size!==links.length)throw Error('Duplicate link name.');
 const names=new Set<string>(),parents=new Map<string,Joint>();
 for(const j of joints){
  if(names.has(j.name))throw Error('Duplicate joint name: '+j.name);names.add(j.name);
  if(!set.has(j.parent)||!set.has(j.child))throw Error('Joint '+j.name+' references an undeclared link.');
  if(parents.has(j.child))throw Error('Link '+j.child+' has multiple parents; closed loops are not supported.');
  parents.set(j.child,j);
 }
 const roots=links.filter(l=>!parents.has(l));
 if(roots.length!==1)throw Error('URDF must be one connected tree with one root; found '+roots.length+' roots.');
 for(const link of links){let current=link;const seen=new Set<string>();while(parents.has(current)){if(seen.has(current))throw Error('Cycle detected; closed loops are not supported.');seen.add(current);current=parents.get(current)!.parent;}if(current!==roots[0])throw Error('Disconnected robot.');}
 return {name:named(r.name,'Robot name'),links,joints,root:roots[0],warnings:Array.isArray(r.warnings)?r.warnings.filter((w):w is string=>typeof w==='string').slice(0,20):[]};
}
const children=(e:Element,name:string)=>Array.from(e.childNodes).filter((n):n is Element=>n.nodeType===1&&(n as Element).tagName===name);
function single(e:Element,name:string,required=false):Element|undefined {const matches=children(e,name);if(matches.length>1)throw Error('Duplicate <'+name+'> in '+e.tagName+'.');if(required&&!matches.length)throw Error('Missing <'+name+'> in '+e.tagName+'.');return matches[0];}
const attr=(e:Element,key:string)=>{const value=e.getAttribute(key);if(value===null)throw Error('Missing '+key+' on <'+e.tagName+'>.');return value;};
export function parseURDF(xml:string):Robot {
 if(!xml.trim())throw Error('Paste or choose a URDF file first.');
 if(new TextEncoder().encode(xml).length>MAX_FILE_BYTES)throw Error('URDF files must be 2 MB or smaller.');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DOCTYPE and entity declarations are not supported.');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length||doc.documentElement.tagName!=='robot')throw Error('Invalid XML: expected one well-formed <robot> document.');
 if(Array.from(doc.getElementsByTagName('*')).some(e=>e.prefix==='xacro'||Array.from(e.attributes).some(a=>/\$\{|\$\(/.test(a.value))))throw Error('Expand Xacro macros before importing the resulting URDF.');
 const root=doc.documentElement,links=children(root,'link').map(e=>attr(e,'name'));
 const joints=children(root,'joint').map(e=>{
  const name=attr(e,'name'),type=attr(e,'type') as JointType;
  if(single(e,'mimic'))throw Error('Joint '+name+' uses mimic coupling, which is not supported yet.');
  if(!TYPES.includes(type))throw Error('Joint '+name+' has unsupported type '+type+'. Floating and planar joints are not supported.');
  const o=single(e,'origin'),a=single(e,'axis'),limit=single(e,'limit');
  if(o?.hasAttribute('quat_xyzw'))throw Error('Joint '+name+': quaternion origins are not supported; use xyz/rpy.');
  const joint:Joint={name,type,parent:attr(single(e,'parent',true)!,'link'),child:attr(single(e,'child',true)!,'link'),origin:origin(triple(o?.getAttribute('xyz')??'0 0 0',name+' origin xyz'),triple(o?.getAttribute('rpy')??'0 0 0',name+' origin rpy')),axis:type==='fixed'?[0,0,1]:triple(a?.getAttribute('xyz')??'1 0 0',name+' axis')};
  if(type==='revolute'||type==='prismatic'){
   if(!limit)throw Error('Joint '+name+' requires <limit lower="…" upper="…">.');
   joint.limits=[numeric(limit.getAttribute('lower')??'0',name+' lower limit'),numeric(limit.getAttribute('upper')??'0',name+' upper limit')];
  }
  return joint;
 });
 const warnings:string[]=[];
 if(doc.getElementsByTagName('visual').length||doc.getElementsByTagName('collision').length)warnings.push('Visual/collision geometry is omitted. Mesh files are not needed or fetched.');
 if(doc.getElementsByTagName('inertial').length||doc.getElementsByTagName('dynamics').length)warnings.push('Mass, inertia, and dynamics are ignored for this kinematics lesson.');
 return readRobot({name:attr(root,'name'),links,joints,warnings});
}
export function descendants(robot:Robot,base:string):string[]{
 if(!robot.links.includes(base))throw Error('Unknown base link.');
 const result=[base];for(let i=0;i<result.length;i++)for(const j of robot.joints)if(j.parent===result[i])result.push(j.child);return result;
}
export function extractChain(robot:Robot,base:string,tip:string,tool:Mat4=identity()):Chain {
 if(!robot.links.includes(base)||!robot.links.includes(tip))throw Error('Select existing base and tip links.');
 assertRigid(tool);const parents=new Map(robot.joints.map(j=>[j.child,j]));const joints:Joint[]=[];let current=tip;
 while(current!==base){const j=parents.get(current);if(!j)throw Error('The tip must be the base link or one of its descendants.');joints.unshift(j);current=j.parent;}
 if(joints.length>100)throw Error('Select a chain with at most 100 joints for the interactive viewport.');
 const chain:Chain={id:'custom',name:robot.name,description:base+' → '+tip,lesson:'Inspect the selected chain, including fixed adapters. Each DH row corresponds to one moving joint. The base and tool transforms complete the equivalence.',base,joints,tool:[...tool]};
 validate(chain);return chain;
}
export function robotFromChain(chain:Chain):Robot {return readRobot({name:chain.name,links:[chain.base,...chain.joints.map(j=>j.child)],joints:chain.joints,warnings:[]});}
export function tipOf(chain:Chain){return chain.joints.at(-1)?.child??chain.base;}
export function motionRange(joint:Joint):[number,number]{return joint.type==='continuous'?[-Math.PI,Math.PI]:joint.limits??(joint.type==='prismatic'?[-.5,.5]:[-Math.PI,Math.PI]);}
export function initialPose(chain:Chain):Record<string,number>{return Object.fromEntries(chain.joints.filter(j=>j.type!=='fixed').map(j=>{const [lo,hi]=motionRange(j);return [j.name,Math.max(lo,Math.min(hi,0))];}));}
export function rpyOf(m:Mat4):Vec3{
 const pitch=Math.atan2(-m[8],Math.hypot(m[0],m[4]));
 if(Math.hypot(m[0],m[4])<1e-10)return [Math.atan2(-m[6],m[5]),pitch,0];
 return [Math.atan2(m[9],m[10]),pitch,Math.atan2(m[4],m[0])];
}
export interface JointDraft {name:string;type:JointType;xyz:string;rpy:string;axis:string;lower:string;upper:string}
export interface ChainDraft {name:string;joints:JointDraft[];toolXYZ:string;toolRPY:string}
export function draftFromChain(c:Chain):ChainDraft {
 const format=(v:number[])=>v.map(x=>Number(x.toPrecision(14))).join(' ');
 return {name:c.name,joints:c.joints.map(j=>({name:j.name,type:j.type,xyz:format(position(j.origin)),rpy:format(rpyOf(j.origin)),axis:format(j.axis),lower:String(motionRange(j)[0]),upper:String(motionRange(j)[1])})),toolXYZ:format(position(c.tool)),toolRPY:format(rpyOf(c.tool))};
}
export function chainFromDraft(d:ChainDraft):Chain {
 if(d.joints.length>100)throw Error('The editor supports at most 100 joints.');
 const joints:Joint[]=d.joints.map((j,i)=>({name:named(j.name,'Joint '+(i+1)+' name'),parent:i?'link_'+i:'base',child:'link_'+(i+1),type:j.type,origin:origin(triple(j.xyz,j.name+' xyz'),triple(j.rpy,j.name+' rpy')),axis:j.type==='fixed'?[0,0,1]:triple(j.axis,j.name+' axis'),...((j.type==='prismatic'||j.type==='revolute')?{limits:[numeric(j.lower,j.name+' lower limit'),numeric(j.upper,j.name+' upper limit')] as [number,number]}:{})}));
 const c:Chain={id:'custom',name:named(d.name,'Robot name'),description:'Edited serial chain',lesson:'Links are generated automatically. XYZ is in meters; RPY and revolute limits are in radians. The tool offset is fixed relative to the last link.',base:'base',joints,tool:origin(triple(d.toolXYZ,'Tool xyz'),triple(d.toolRPY,'Tool rpy'))};validate(c);return c;
}
