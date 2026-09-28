import * as THREE from 'three';
import {type Joint} from './core/urdf';
import {type Mat4} from './core/math';

const Y=new THREE.Vector3(0,1,0);
const NEUTRAL=0x8293a5;
const SELECTED=0xffc45b;

/** Schematic joint geometry. Local +Y is the motion axis, not a DH frame axis. */
export function createJointGlyph(joint:Joint,before:Mat4,q:number,size:number,selected:boolean,palette?:{housing:number;gold:number;cap:number;index:number;guide?:number}):THREE.Group {
 const root=new THREE.Group();
 root.name='joint:'+joint.name;
 root.userData={jointName:joint.name,jointType:joint.type};
 root.applyMatrix4(new THREE.Matrix4().fromArray(before).transpose());
 const axis=new THREE.Group();axis.name='motion-axis';
 if(joint.type!=='fixed')axis.quaternion.setFromUnitVectors(Y,new THREE.Vector3(...joint.axis).normalize());
 root.add(axis);
 const material=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.2});
 const housing=material(selected?(palette?.gold??SELECTED):(palette?.housing??NEUTRAL)),light=material(palette?.cap??0xc4ced6),dark=material(palette?.index??0x344352);
 function mesh(geometry:THREE.BufferGeometry,mat:THREE.Material,name:string,parent:THREE.Group=axis){
  const object=new THREE.Mesh(geometry,mat);object.name=name;parent.add(object);return object;
 }
 if(joint.type==='revolute'||joint.type==='continuous'){
  const radius=.064*size,height=.22*size;
  mesh(new THREE.CylinderGeometry(radius,radius,height,24),housing,'revolute-body');
  // A narrow shaft shows the axis even when long joint-axis lines are hidden.
  mesh(new THREE.CylinderGeometry(.024*size,.024*size,.29*size,16),dark,'revolute-shaft');
  const rotor=new THREE.Group();rotor.name='rotor';rotor.position.y=height/2+.012*size;rotor.rotation.y=q;axis.add(rotor);
  mesh(new THREE.CylinderGeometry(.071*size,.071*size,.025*size,24),light,'rotor-cap',rotor);
  // The radial stripe rotates with q and makes an otherwise symmetric cylinder readable.
  const index=mesh(new THREE.BoxGeometry(.016*size,.008*size,.052*size),dark,'rotor-index',rotor);
  index.position.set(0,.0165*size,.030*size);
 }else if(joint.type==='prismatic'){
  const guideMaterial=material(palette?.guide??0x344352);
  const [lo,hi]=joint.limits??[-.25*size,.25*size];
  const length=hi-lo+.18*size,center=(lo+hi)/2;
  for(const x of [-.054,.054]){
   const guide=mesh(new THREE.BoxGeometry(.017*size,length,.027*size),guideMaterial,'prismatic-guide');
   guide.position.set(x*size,center,0);
  }
  // End stops show the supplied travel interval; without limits the guide is schematic.
  if(joint.limits)for(const y of [lo-.085*size,hi+.085*size]){
   const stop=mesh(new THREE.BoxGeometry(.16*size,.022*size,.065*size),light,'prismatic-stop');stop.position.y=y;
  }
  const carriage=mesh(new THREE.BoxGeometry(.17*size,.12*size,.095*size),housing,'prismatic-carriage');carriage.position.y=q;
  const stripe=mesh(new THREE.BoxGeometry(.10*size,.016*size,.006*size),light,'prismatic-index');stripe.position.set(0,q,.051*size);
 }else{
  // A fixed connector has no implied rotation or translation axis.
  mesh(new THREE.BoxGeometry(.082*size,.082*size,.082*size),palette?.guide!==undefined?material(palette.guide):dark,'fixed-connector');
 }
 return root;
}

/** Measurements from rendered objects, used by regression tests and local diagnostics. */
export function jointGlyphMetrics(root:THREE.Group){
 root.updateWorldMatrix(true,true);
 const axis=root.getObjectByName('motion-axis')!;
 const worldAxis=Y.clone().transformDirection(axis.matrixWorld).toArray();
 const carriage=root.getObjectByName('prismatic-carriage');
 const body=root.getObjectByName('revolute-body') as THREE.Mesh<THREE.CylinderGeometry>|undefined;
 const slider=carriage as THREE.Mesh<THREE.BoxGeometry>|undefined;
 const fixed=root.getObjectByName('fixed-connector') as THREE.Mesh<THREE.BoxGeometry>|undefined;
 const dimensions=body?[body.geometry.parameters.radiusTop,body.geometry.parameters.height]:slider?[slider.geometry.parameters.width,slider.geometry.parameters.height,slider.geometry.parameters.depth]:[fixed!.geometry.parameters.width,fixed!.geometry.parameters.height,fixed!.geometry.parameters.depth];
 return {
  name:root.userData.jointName as string,type:root.userData.jointType as string,
  origin:root.getWorldPosition(new THREE.Vector3()).toArray(),
  axis:root.userData.jointType==='fixed'?null:worldAxis,
  dimensions,
  carriage:carriage?.getWorldPosition(new THREE.Vector3()).toArray(),
  rotorIndex:root.getObjectByName('rotor-index')?.getWorldPosition(new THREE.Vector3()).toArray(),
 };
}
