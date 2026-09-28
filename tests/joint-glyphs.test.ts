import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createJointGlyph,jointGlyphMetrics} from '../src/joint-glyphs';
import {origin,position,point,unit,direction,scale,type Vec3} from '../src/core/math';
import {type Joint} from '../src/core/urdf';

const baseJoint:Joint={name:'joint',parent:'base',child:'tip',type:'revolute',origin:origin(),axis:[0,0,1]};
function vectorClose(actual:number[],expected:number[]){actual.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],11));}
function cleanup(root:THREE.Group){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});}
describe('physical joint glyphs',()=>{
 it.each<Vec3>([[0,0,1],[0,1,0],[0,-1,0],[1,2,-3]])('aligns the cylinder height with URDF axis %j',(...values)=>{
  const axis=values as Vec3,before=origin([.3,-.7,1.2],[.5,-.9,.3]),joint={...baseJoint,axis};
  const glyph=createJointGlyph(joint,before,.7,1,false),metrics=jointGlyphMetrics(glyph);
  vectorClose(metrics.axis!,unit(direction(before,axis)));vectorClose(metrics.origin,position(before));
  const body=glyph.getObjectByName('revolute-body') as THREE.Mesh<THREE.CylinderGeometry>;
  expect(body.geometry.parameters.height).toBeGreaterThan(body.geometry.parameters.radiusTop*2);
  cleanup(glyph);
 });
 it('rotates the end-cap index without changing cylinder dimensions or axis',()=>{
  const before=origin([0,0,.5],[.2,.3,.4]),a=createJointGlyph(baseJoint,before,0,2,false),b=createJointGlyph(baseJoint,before,Math.PI/2,2,true);
  const am=jointGlyphMetrics(a),bm=jointGlyphMetrics(b);expect(am.dimensions).toEqual(bm.dimensions);vectorClose(am.axis!,bm.axis!);expect(am.rotorIndex).not.toEqual(bm.rotorIndex);
  const rotor=b.getObjectByName('rotor')!;expect(rotor.rotation.y).toBe(Math.PI/2);cleanup(a);cleanup(b);
 });
 it('uses the same rotary representation for continuous joints',()=>{const glyph=createJointGlyph({...baseJoint,type:'continuous'},origin(),-2,1,false);expect(glyph.getObjectByName('revolute-body')).toBeDefined();cleanup(glyph);});
 it('moves a prismatic carriage by the signed URDF displacement while its guide stays fixed',()=>{
  const before=origin([.5,-.3,.7],[.3,-.2,.8]),joint:Joint={...baseJoint,type:'prismatic',axis:[1,-2,3],limits:[-.5,.8]};
  const first=createJointGlyph(joint,before,-.3,1,false),last=createJointGlyph(joint,before,.6,1,true);
  vectorClose(jointGlyphMetrics(first).carriage!,point(before,scale(unit(joint.axis),-.3)));
  vectorClose(jointGlyphMetrics(last).carriage!,point(before,scale(unit(joint.axis),.6)));
  const guides=(root:THREE.Group)=>{const positions:number[][]=[];root.traverse(o=>{if(o.name==='prismatic-guide')positions.push(o.getWorldPosition(new THREE.Vector3()).toArray());});return positions;};
  expect(guides(first)).toEqual(guides(last));expect(jointGlyphMetrics(first).dimensions).toEqual(jointGlyphMetrics(last).dimensions);cleanup(first);cleanup(last);
 });
 it('keeps fixed connectors compact and does not invent an axis',()=>{const glyph=createJointGlyph({...baseJoint,type:'fixed',axis:[0,0,0]},origin(),0,1,false);expect(glyph.getObjectByName('fixed-connector')).toBeDefined();expect(jointGlyphMetrics(glyph).axis).toBeNull();expect(glyph.getObjectByName('rotor')).toBeUndefined();cleanup(glyph);});
});
