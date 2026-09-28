import {type Mat4,type Vec3,add,sub,scale,dot,cross,norm,unit,identity,mul,inverse,position,column,direction,frame,perpendicular,poseError,rz,rx,translation} from './math';
import {type Chain,validate,urdfFK} from './urdf';
export type AxisCase='skew'|'intersecting'|'parallel'|'coincident'|'terminal';
export interface DHRow {joint:string;child:string;type:'revolute'|'continuous'|'prismatic';theta:number;d:number;a:number;alpha:number;sign:1;axisCase:AxisCase;from:Vec3;to:Vec3;nearParallel:boolean;attachment:Mat4;reason:string}
export interface DHModel {base:Mat4;tool:Mat4;rows:DHRow[];referenceFrames:Mat4[]}
export function commonNormal(p:Vec3,u:Vec3,q:Vec3,v:Vec3,fallback:Vec3){
 u=unit(u);v=unit(v);const w=sub(q,p),n=cross(u,v),sine=norm(n);let from:Vec3,to:Vec3,x:Vec3,axisCase:AxisCase;
 if(sine<=1e-12){
  from=p;to=sub(q,scale(v,dot(sub(q,p),v)));const delta=sub(to,from);
  if(norm(delta)<=1e-10){axisCase='coincident';to=from;x=unit(sub(fallback,scale(v,dot(fallback,v))));}
  else {axisCase='parallel';x=unit(delta);}
 }else{
  from=add(p,scale(u,dot(cross(w,v),n)/(sine*sine)));to=add(q,scale(v,dot(cross(w,u),n)/(sine*sine)));
  const delta=sub(to,from);
  if(norm(delta)<=1e-10){axisCase='intersecting';x=unit(n);}else{axisCase='skew';x=unit(delta);}
 }
 return {from,to,x,axisCase,nearParallel:sine>1e-12&&sine<1e-5};
}
const reasons:Record<AxisCase,string>={skew:'The shortest segment perpendicular to both axes defines xᵢ. Its endpoint on the next axis is the new origin.',intersecting:'The axes meet: a = 0. Their cross product defines xᵢ, perpendicular to the plane of both axes.',parallel:'Parallel axes admit many common normals. We choose the one through the current joint’s reference origin.',coincident:'The axes share a line: a = 0. We retain the previous x direction and choose the current joint’s reference origin.',terminal:'There is no next joint. The terminal frame uses the last joint’s origin and axis; the fixed tool transform reaches the end effector.'};
/** Geometry is solved once at q=0. Frames remain rigidly attached thereafter. */
export function convertToDH(chain:Chain):DHModel {
 validate(chain);const home=urdfFK(chain),active=chain.joints.filter(j=>j.type!=='fixed');
 if(!active.length)return {base:identity(),tool:home.tip,rows:[],referenceFrames:[identity()]};
 const axes=active.map(j=>({p:position(home.before[j.name]),z:unit(direction(home.before[j.name],j.axis))}));
 let previous=frame(axes[0].p,perpendicular(axes[0].z),axes[0].z);const base=previous,referenceFrames=[previous],rows:DHRow[]=[];
 active.forEach((j,i)=>{
  const current=axes[i],next=axes[i+1];
  const geometry=next?commonNormal(current.p,current.z,next.p,next.z,column(previous,0)):{from:current.p,to:current.p,x:column(previous,0),axisCase:'terminal' as AxisCase,nearParallel:false};
  const target=frame(geometry.to,geometry.x,next?.z??current.z),relative=mul(inverse(previous),target);
  const theta=Math.atan2(relative[4],relative[0]),alpha=Math.atan2(relative[9],relative[10]),d=relative[11],a=relative[3]*Math.cos(theta)+relative[7]*Math.sin(theta);
  const row:DHRow={joint:j.name,child:j.child,type:j.type as DHRow['type'],theta,d,a,alpha,sign:1,axisCase:geometry.axisCase,from:geometry.from,to:geometry.to,nearParallel:geometry.nearParallel,attachment:mul(inverse(home.links[j.child]),target),reason:reasons[geometry.axisCase]};
  const reconstructed=mul(previous,dhMatrix(row));const error=poseError(reconstructed,target);
  if(!Number.isFinite(error.position)||!Number.isFinite(error.orientation)||error.position>1e-7||error.orientation>1e-7)throw Error(`Could not construct a stable DH frame for ${j.name}.`);
  rows.push(row);referenceFrames.push(target);previous=target;
 });return {base,tool:mul(inverse(previous),home.tip),rows,referenceFrames};
}
export function evaluated(row:DHRow,q=0){return {theta:row.theta+(row.type!=='prismatic'?q*row.sign:0),d:row.d+(row.type==='prismatic'?q*row.sign:0),a:row.a,alpha:row.alpha};}
/** Closed-form standard DH, independent of URDF's axis-angle implementation. */
export function dhMatrix(row:Pick<DHRow,'theta'|'d'|'a'|'alpha'|'type'|'sign'>,q=0):Mat4{
 const theta=row.theta+(row.type!=='prismatic'?q*row.sign:0),d=row.d+(row.type==='prismatic'?q*row.sign:0),c=Math.cos(theta),s=Math.sin(theta),ca=Math.cos(row.alpha),sa=Math.sin(row.alpha);
 return [c,-s*ca,s*sa,row.a*c,s,c*ca,-c*sa,row.a*s,0,sa,ca,d,0,0,0,1];
}
export function dhFK(model:DHModel,q:Record<string,number>={}){let t=model.base;const frames=[t];for(const row of model.rows){const v=Object.hasOwn(q,row.joint)?q[row.joint]:0;if(!Number.isFinite(v))throw Error('Joint position must be finite.');t=mul(t,dhMatrix(row,v));frames.push(t);}return {frames,tip:mul(t,model.tool)};}
/** Progress 0..4: postmultiply rotations/translations about the moving frame axes. */
export function constructionFrames(start:Mat4,row:DHRow,q:number,progress:number):Mat4[]{
 if(!Number.isFinite(progress))throw Error('Construction progress must be finite.');const v=evaluated(row,q),f=[start];let t=start;
 const ops=[(s:number)=>rz(v.theta*s),(s:number)=>translation([0,0,v.d*s]),(s:number)=>translation([v.a*s,0,0]),(s:number)=>rx(v.alpha*s)];
 for(let i=0;i<4;i++){if(progress<=i)break;t=mul(t,ops[i](Math.min(1,progress-i)));f.push(t);}return f;
}
export function verifyPose(chain:Chain,model:DHModel,q:Record<string,number>={}){const urdf=urdfFK(chain,q),dh=dhFK(model,q);const attachmentErrors=model.rows.map((r,i)=>poseError(mul(urdf.links[r.child],r.attachment),dh.frames[i+1]));return {...poseError(urdf.tip,dh.tip),attachmentPosition:Math.max(0,...attachmentErrors.map(e=>e.position)),attachmentOrientation:Math.max(0,...attachmentErrors.map(e=>e.orientation))};}
