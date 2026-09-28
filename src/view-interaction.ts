import * as THREE from 'three';

/** Keep a stable azimuth at the Z-up poles; the tiny tilt avoids a lookAt singularity. */
export function stableViewDirection(direction:THREE.Vector3,previousOffset:THREE.Vector3){
 const result=direction.clone().normalize();
 if(Math.hypot(result.x,result.y)<1e-5){
  const heading=new THREE.Vector2(previousOffset.x,previousOffset.y);
  if(heading.lengthSq()<1e-12)heading.set(1,-1);
  heading.normalize();result.set(heading.x*1e-5,heading.y*1e-5,result.z).normalize();
 }
 return result;
}

/** A tap must stay near its starting position for the entire gesture, not just at release. */
export class SelectionGesture {
 private pointers=new Set<number>();
 private candidate?:{id:number;x:number;y:number;row:number|undefined;slop:number;valid:boolean};
 down(id:number,x:number,y:number,button:number,primary:boolean,touch:boolean,row:number|undefined){
  this.pointers.add(id);
  if(this.pointers.size!==1){if(this.candidate)this.candidate.valid=false;return;}
  this.candidate={id,x,y,row,slop:touch?12:6,valid:primary&&button===0};
 }
 move(id:number,x:number,y:number){const c=this.candidate;if(c?.id===id&&Math.hypot(x-c.x,y-c.y)>c.slop)c.valid=false;}
 up(id:number,x:number,y:number){this.move(id,x,y);this.pointers.delete(id);const c=this.candidate;if(c?.id!==id)return;this.candidate=undefined;return c.valid?c.row:undefined;}
 cancel(id:number){this.pointers.delete(id);if(this.candidate)this.candidate.valid=false;}
 get active(){return this.pointers.size>0;}
}

function visible(object:THREE.Object3D){for(let p:THREE.Object3D|null=object;p;p=p.parent)if(!p.visible)return false;return true;}
/** Physical symbols take precedence over teaching annotations. Padding is in CSS pixels. */
export function pickJoint(glyphs:THREE.Object3D[],camera:THREE.Camera,x:number,y:number,width:number,height:number,padding=9):number|undefined {
 if(!width||!height||x<0||y<0||x>width||y>height)return;
 camera.updateMatrixWorld();for(const g of glyphs)g.updateWorldMatrix(true,true);
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
 const hit=ray.intersectObjects(glyphs,true).find(h=>visible(h.object)&&h.object instanceof THREE.Mesh&&h.object.userData.row!==undefined);
 if(hit)return hit.object.userData.row as number;
 let best:{row:number;distance:number;center:number;depth:number}|undefined;
 for(const glyph of glyphs)glyph.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||!visible(object)||!['revolute-body','rotor-cap','prismatic-carriage'].includes(object.name))return;
  if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();const box=object.geometry.boundingBox;if(!box)return;
  const projected:THREE.Vector3[]=[];
  for(const px of [box.min.x,box.max.x])for(const py of [box.min.y,box.max.y])for(const pz of [box.min.z,box.max.z]){
   const p=new THREE.Vector3(px,py,pz).applyMatrix4(object.matrixWorld).project(camera);if(p.z>=-1&&p.z<=1)projected.push(p);
  }
  if(projected.length!==8)return;
  const xs=projected.map(p=>(p.x+1)*width/2),ys=projected.map(p=>(1-p.y)*height/2),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const distance=Math.hypot(Math.max(left-x,0,x-right),Math.max(top-y,0,y-bottom));if(distance>padding)return;
  const center=Math.hypot(x-(left+right)/2,y-(top+bottom)/2),depth=Math.min(...projected.map(p=>p.z)),row=object.userData.row;
  if(row===undefined)return;
  if(!best||distance<best.distance-1e-6||Math.abs(distance-best.distance)<1e-6&&(center<best.center-1e-6||Math.abs(center-best.center)<1e-6&&depth<best.depth))best={row,distance,center,depth};
 });
 return best?.row;
}
