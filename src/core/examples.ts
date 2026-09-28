import {type Vec3,origin,identity} from './math';
import {type Chain,type Joint,type JointType} from './urdf';
type Spec={xyz?:Vec3;rpy?:Vec3;axis?:Vec3;type?:JointType;name?:string};
function chain(id:string,name:string,description:string,lesson:string,specs:Spec[],tool=origin([.55,0,0])):Chain {
 const joints:Joint[]=specs.map((s,i)=>({name:s.name??`joint_${i+1}`,parent:i?`link_${i}`:'base',child:`link_${i+1}`,type:s.type??'revolute',origin:origin(s.xyz,s.rpy),axis:s.axis??[0,0,1],limits:s.type==='prismatic'?[-.35,.65]:[-Math.PI,Math.PI]}));
 return {id,name,description,lesson,base:'base',joints,tool};
}
export const examples:Chain[]=[
 chain('skew','Spatial elbow','Three revolute joints with skew axes.','Start with row 1: the gold segment is perpendicular to both joint axes. Follow its four transformations to construct F₁.',[{xyz:[0,0,.4]},{xyz:[1.15,0,.5],axis:[0,1,0]},{xyz:[.75,.35,.7],axis:[1,0,0]}],origin([.6,0,.15],[0,.3,0])),
 chain('planar','Planar 2R','Two revolute joints with parallel axes.','Parallel axes allow a choice of common normal. Here a₁ is the first arm length, and the second arm length belongs to the tool transform.',[{xyz:[0,0,.4]},{xyz:[1.2,0,0]}],origin([.9,0,0])),
 chain('intersecting','Intersecting wrist','Three axes meeting at a single point.','When axes intersect, a = 0. The red x-axis is perpendicular to the plane of the two joint axes.',[{xyz:[0,0,.8]},{axis:[0,1,0]},{axis:[1,0,0]}],origin([.8,0,0])),
 chain('parallel','Parallel & reversed','Parallel axes, including opposite directions.','Opposite axis directions can produce α = π. Positive q still follows each original URDF axis.',[{xyz:[0,0,.3]},{xyz:[1,0,.5]},{xyz:[.8,0,-.2],axis:[0,0,-1]}]),
 chain('coincident','Coincident axes','Two revolute joints share one axis.','No unique transverse direction exists. We keep the previous x direction; both rotations still contribute to the tool pose.',[{xyz:[0,0,.35]},{xyz:[0,0,.8]}],origin([.85,0,0])),
 chain('mixed','Rotate, slide, rotate','A chain containing a prismatic joint.','Move the slide joint. Its d value changes; its θ value stays constant. DH frames remain attached to their links.',[{xyz:[0,0,.3]},{xyz:[.8,0,.4],type:'prismatic',axis:[0,0,1]},{xyz:[.75,0,.4],axis:[0,1,0]}]),
 chain('adapters','Fixed adapters','Arbitrary URDF frames and fixed spacers.','URDF frames need not align with joint axes. Fixed adapters contribute geometry without adding movable DH rows.',[{type:'fixed',name:'mount',xyz:[.2,-.2,.3],rpy:[.2,-.3,.4]},{axis:[1,1,.3]},{type:'fixed',name:'spacer',xyz:[.65,0,.2],rpy:[.3,.4,-.2]},{xyz:[.3,.2,.4],rpy:[-.4,.2,.3],axis:[-.3,1,.5]},{xyz:[.6,.2,.3],type:'prismatic',axis:[0,1,1]}],origin([.4,.2,.3],[.3,-.2,.4])),
 chain('near','Nearly parallel','A small axis tilt with distant DH origins.','Nearly parallel axes can place DH origins far away. This is a coordinate sensitivity, not a long physical link. Use Fit all to inspect the full construction.',[{xyz:[0,0,.4]},{xyz:[.8,.3,.2],axis:[.000001,0,1]}],identity()),
];
