import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {SelectionGesture,stableViewDirection,pickJoint} from '../src/view-interaction';
function body(row:number,x=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshBasicMaterial());m.name='prismatic-carriage';m.userData.row=row;m.position.set(x,0,z);return m;}
function camera(){const c=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);c.position.set(0,0,5);c.lookAt(0,0,0);c.updateMatrixWorld();return c;}
describe('stable Z-up camera alignment',()=>{
 it('keeps arbitrary nonvertical directions exact',()=>{const d=new THREE.Vector3(1,-2,3).normalize();expect(stableViewDirection(d,new THREE.Vector3(3,4,5)).distanceTo(d)).toBeLessThan(1e-12);});
 it.each([1,-1])('keeps the previous heading and avoids the %s Z pole singularity',sign=>{const d=stableViewDirection(new THREE.Vector3(0,0,sign),new THREE.Vector3(3,-4,2));expect(d.z*sign).toBeGreaterThan(.999999999);expect(d.x/d.y).toBeCloseTo(-.75,10);expect(Math.hypot(d.x,d.y)).toBeGreaterThan(1e-6);});
});
describe('joint selection gestures',()=>{
 it('accepts small hand jitter and repeated clicks on the same joint',()=>{const g=new SelectionGesture();for(let i=0;i<2;i++){g.down(1,40,50,0,true,false,2);g.move(1,43,51);expect(g.up(1,43,51)).toBe(2);}});
 it('rejects an orbit dragged away and back to its start',()=>{const g=new SelectionGesture();g.down(1,40,50,0,true,false,2);g.move(1,80,90);expect(g.up(1,40,50)).toBeUndefined();});
 it('rejects right-click pan, cancellation, and multi-touch',()=>{const g=new SelectionGesture();g.down(1,0,0,2,true,false,1);expect(g.up(1,0,0)).toBeUndefined();g.down(1,0,0,0,true,false,1);g.cancel(1);expect(g.up(1,0,0)).toBeUndefined();g.down(1,0,0,0,true,true,1);g.down(2,20,20,0,false,true,2);expect(g.up(2,20,20)).toBeUndefined();expect(g.up(1,0,0)).toBeUndefined();});
});
describe('physical joint picking',()=>{
 it('uses current transforms even before the next render and picks the front joint',()=>{const c=camera(),rear=body(0),front=body(1,0,1);expect(pickJoint([rear,front],c,200,200,400,400)).toBe(1);front.position.x=1;expect(pickJoint([rear,front],c,300,200,400,400)).toBe(1);});
 it('accepts a small pixel miss without creating a large world-space target',()=>{const c=camera(),joint=body(1);expect(pickJoint([joint],c,216,200,400,400)).toBe(1);expect(pickJoint([joint],c,231,200,400,400)).toBeUndefined();c.zoom=.2;c.updateProjectionMatrix();expect(pickJoint([joint],c,209,200,400,400)).toBe(1);expect(pickJoint([joint],c,216,200,400,400)).toBeUndefined();});
 it('ignores hidden geometry and does not pad long prismatic rails',()=>{const c=camera(),joint=body(1);joint.visible=false;expect(pickJoint([joint],c,200,200,400,400)).toBeUndefined();const group=new THREE.Group();group.add(joint);joint.visible=true;group.visible=false;expect(pickJoint([group],c,200,200,400,400)).toBeUndefined();const guide=body(2);guide.name='prismatic-guide';expect(pickJoint([guide],c,216,200,400,400)).toBeUndefined();});
 it('ignores arrow lines even with the Raycaster default broad line threshold',()=>{const c=camera(),arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),1);arrow.traverse(o=>o.userData.row=9);expect(pickJoint([arrow,body(1)],c,200,200,400,400)).toBe(1);});
});
