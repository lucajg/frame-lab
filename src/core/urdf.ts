import {type Mat4,type Vec3,identity,mul,rotation,translation,scale,unit} from './math';
export type JointType='revolute'|'continuous'|'prismatic'|'fixed';
export interface Joint {name:string; parent:string; child:string; type:JointType; origin:Mat4; axis:Vec3; limits?:[number,number]}
export interface Chain {id:string; name:string; description:string; lesson:string; base:string; joints:Joint[]; tool:Mat4}
export function validate(chain:Chain){
 let parent=chain.base;const links=new Set([parent]),names=new Set<string>();
 for(const j of chain.joints){
  if(j.parent!==parent||links.has(j.child)||names.has(j.name))throw Error('Chain must be ordered, connected, acyclic, and have unique joint names.');
  if(!['revolute','continuous','prismatic','fixed'].includes(j.type))throw Error('Unsupported joint type.');
  if(j.type!=='fixed')unit(j.axis);
  if(j.limits&&(!j.limits.every(Number.isFinite)||j.limits[0]>j.limits[1]))throw Error('Invalid joint limits.');
  assertRigid(j.origin);links.add(j.child);names.add(j.name);parent=j.child;
 }assertRigid(chain.tool);
}
export function assertRigid(m:Mat4){
 if(!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite)||Math.abs(m[12])+Math.abs(m[13])+Math.abs(m[14])+Math.abs(m[15]-1)>1e-9)throw Error('Invalid rigid transform.');
 for(let i=0;i<3;i++)for(let j=0;j<3;j++){let v=0;for(let k=0;k<3;k++)v+=m[k*4+i]*m[k*4+j];if(Math.abs(v-(i===j?1:0))>1e-8)throw Error('Rotation must be orthonormal.');}
 const det=m[0]*(m[5]*m[10]-m[6]*m[9])-m[1]*(m[4]*m[10]-m[6]*m[8])+m[2]*(m[4]*m[9]-m[5]*m[8]);if(det<0)throw Error('Rotation must be right-handed.');
}
/** Independent URDF FK: parent × origin × motion(axis expressed in joint frame). */
export function urdfFK(chain:Chain,q:Record<string,number>={}){
 let t=identity();const links:Record<string,Mat4>=Object.create(null),before:Record<string,Mat4>=Object.create(null);links[chain.base]=t;
 for(const j of chain.joints){const value=Object.hasOwn(q,j.name)?q[j.name]:0;if(!Number.isFinite(value))throw Error('Joint position must be finite.');t=mul(t,j.origin);before[j.name]=t;
  if(j.type==='prismatic')t=mul(t,translation(scale(unit(j.axis),value)));
  else if(j.type!=='fixed')t=mul(t,rotation(j.axis,value));
  if(!t.every(Number.isFinite))throw Error('Kinematic transform overflow; reduce the model scale or joint displacement.');
  links[j.child]=t;
 }const tip=mul(t,chain.tool);if(!tip.every(Number.isFinite))throw Error('Kinematic transform overflow; reduce the model scale or tool displacement.');return {links,before,tip};
}
