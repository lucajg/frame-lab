// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {parseURDF,extractChain,descendants,robotFromChain,draftFromChain,chainFromDraft,initialPose,rpyOf} from '../src/core/robot';
import {convertToDH,verifyPose,dhFK,dhMatrix} from '../src/core/dh';
import {examples} from '../src/core/examples';
import {origin,poseError,identity,mul} from '../src/core/math';
import {parseSession,serializeSession,exportDH,type LabSession} from '../src/core/session';
import {referenceDisplayScale} from '../src/core/display';
export const fixture='<robot name="branched"><link name="base"/><link name="arm"/><link name="wrist"/><link name="tool"/><link name="sensor"/><joint name="shoulder" type="revolute"><parent link="base"/><child link="arm"/><origin xyz="0 0 0.4"/><axis xyz="0 0 1"/><limit lower="-1" upper="2"/></joint><joint name="slide" type="prismatic"><parent link="arm"/><child link="wrist"/><origin xyz="1 0 0.2" rpy="0.2 0.4 -0.3"/><axis xyz="0 1 0"/><limit lower="0.1" upper="0.8"/></joint><joint name="adapter" type="fixed"><parent link="wrist"/><child link="tool"/><origin xyz="0.4 0.1 0.2" rpy="0.3 0.2 -0.1"/></joint><joint name="sensor_mount" type="fixed"><parent link="base"/><child link="sensor"/></joint></robot>';
describe('URDF import and chain extraction',()=>{
 it('extracts the selected path in a tree with fixed transforms and checks 100 poses',()=>{const r=parseURDF(fixture),c=extractChain(r,'base','tool'),m=convertToDH(c);expect(r.root).toBe('base');expect(c.joints.map(j=>j.name)).toEqual(['shoulder','slide','adapter']);expect(descendants(r,'arm')).toEqual(['arm','wrist','tool']);for(let i=0;i<100;i++){const e=verifyPose(c,m,{shoulder:-1+3*i/99,slide:.1+.7*i/99});expect(e.position).toBeLessThan(1e-8);expect(e.orientation).toBeLessThan(1e-8);expect(e.attachmentPosition).toBeLessThan(1e-8);}});
 it('supports internal bases and zero-motion chains',()=>{const r=parseURDF(fixture);expect(extractChain(r,'arm','tool').joints).toHaveLength(2);expect(convertToDH(extractChain(r,'base','sensor')).rows).toHaveLength(0);expect(extractChain(r,'tool','tool').joints).toHaveLength(0);expect(()=>extractChain(r,'arm','sensor')).toThrow(/descendant/);});
 it('uses URDF default origin and positive x axis for continuous joints',()=>{const r=parseURDF('<robot name="r"><link name="a"/><link name="b"/><joint name="spin" type="continuous"><parent link="a"/><child link="b"/></joint></robot>');expect(r.joints[0].axis).toEqual([1,0,0]);expect(r.joints[0].origin).toEqual(identity());expect(r.joints[0].limits).toBeUndefined();});
 it('ignores missing meshes without making requests',()=>{const r=parseURDF(fixture.replace('<link name="arm"/>','<link name="arm"><visual><geometry><mesh filename="package://missing/arm.stl"/></geometry></visual></link>'));expect(r.warnings[0]).toContain('not needed or fetched');});
 it.each([
  [fixture.replace('type="revolute"','type="floating"'),'unsupported'],
  [fixture.replace('<axis xyz="0 0 1"/>','<mimic joint="slide"/>'),'mimic'],
  [fixture.replace('xyz="0 0 0.4"','xyz="${height} 0 0"'),'Xacro'],
  [fixture.replace('<link name="sensor"/>',''),'undeclared'],
  [fixture.replace('<link name="sensor"/>','<link name="arm"/>'),'Duplicate'],
  [fixture.replace('<link name="sensor"/>','<link name="sensor"/><link name="orphan"/>'),'root'],
  [fixture.replace('name="sensor_mount"','name="shoulder"'),'Duplicate'],
  [fixture.replace('xyz="0 0 1"','xyz="0 0 0"'),'Axis'],
  [fixture.replace('lower="-1" upper="2"','lower="3" upper="2"'),'limits'],
  [fixture.replace('xyz="0 0 0.4"','xyz="NaN 0 0"'),'numbers'],
  [fixture.replace('<limit lower="-1" upper="2"/>',''),'requires'],
  ['<!DOCTYPE robot><robot name="x"><link name="a"/></robot>','DOCTYPE'],
  ['<robot name="x"><link></robot>','Invalid XML']
 ])('rejects unsupported or malformed input without guessing (%#)',(xml,message)=>expect(()=>parseURDF(xml)).toThrow(message));
 it('rejects cycles and multiple parents',()=>{expect(()=>parseURDF('<robot name="x"><link name="a"/><link name="b"/><joint name="a" type="fixed"><parent link="a"/><child link="b"/></joint><joint name="b" type="fixed"><parent link="b"/><child link="a"/></joint></robot>')).toThrow(/root/);expect(()=>parseURDF(fixture.replace('<child link="sensor"/>','<child link="arm"/>'))).toThrow(/multiple parents/);});
 it('treats unusual names as data, including prototype keys',()=>{const r=parseURDF(fixture.replaceAll('shoulder','constructor').replaceAll('base','__proto__'));const c=extractChain(r,'__proto__','tool');expect(verifyPose(c,convertToDH(c),{constructor:.5,slide:.3}).position).toBeLessThan(1e-8);});
});
describe('serial editor and marker-size regression',()=>{
 for(const c of examples)it('round trips '+c.name+' through editable XYZ/RPY fields',()=>{const result=chainFromDraft(draftFromChain(c));expect(result.joints).toHaveLength(c.joints.length);result.joints.forEach((j,i)=>{expect(poseError(j.origin,c.joints[i].origin).orientation).toBeLessThan(1e-10);});expect(poseError(result.tool,c.tool).position).toBeLessThan(1e-10);});
 it('round trips RPY gimbal-lock orientations',()=>{for(const p of [-Math.PI/2,Math.PI/2]){const m=origin([0,0,0],[.4,p,.7]);expect(poseError(m,origin([0,0,0],rpyOf(m))).orientation).toBeLessThan(1e-9);}});
 it('starts inside limits without altering the q=0 DH reference',()=>{const c=extractChain(parseURDF(fixture),'base','tool');expect(initialPose(c).slide).toBe(.1);expect(convertToDH(c).rows[1].d).not.toBeNaN();});
 it('sets a fixed model scale with no pose-dependent inputs',()=>{const chain=examples[0],reference=referenceDisplayScale(chain);for(const q of [0,.5,2,-2]){verifyPose(chain,convertToDH(chain),{joint_1:q,joint_2:q});expect(referenceDisplayScale(chain)).toBe(reference);}expect(referenceDisplayScale({...chain})).toBe(reference);});
});
describe('session persistence and complete DH export',()=>{
 function session():LabSession{const c=examples[0];return {format:'frame-lab-session',version:1,robot:robotFromChain(c),selection:{base:c.base,tip:c.joints.at(-1)!.child,tool:c.tool},q:initialPose(c),view:{selected:1,focus:true,mode:'construction',progress:2.5,degrees:false,layers:{links:true,axes:true,urdf:false,dh:true,normals:true,dimensions:true,ghost:true,tool:true},hiddenFrames:['f0'],camera:{projection:'orthographic',position:[3,-4,2],target:[0,0,0],up:[0,0,1],zoom:1,halfHeight:2}}};}
 it('round trips model, boundary transforms, pose, selection and view',()=>{const s=session();const loaded=parseSession(serializeSession(s));expect(loaded).toMatchObject(s);expect(loaded.view.workspace?.task).toBe('understand');expect(loaded.view.workspace?.tasks.understand.hiddenFrames).toEqual(['f0']);});
 it('rejects bad versions, limits, matrices, and view data',()=>{for(const mutate of [(s:any)=>s.version=2,(s:any)=>s.q.joint_1=999,(s:any)=>s.selection.tool[0]=2,(s:any)=>s.view.selected=99,(s:any)=>s.view.camera.up=[0,0,0],(s:any)=>s.view.hiddenFrames=['missing']]){const s=session();mutate(s);expect(()=>parseSession(JSON.stringify(s))).toThrow();}});
 it('exports enough data to reconstruct every pose independently',()=>{const c=examples[6],m=convertToDH(c),exported=exportDH(c,initialPose(c));expect(exported.convention).toBe('standard DH');expect(exported.units).toEqual({length:'meter',angle:'radian'});for(const qv of [0,.25,-.3]){let t=exported.baseTransform;const q=Object.fromEntries(m.rows.map(r=>[r.joint,qv]));for(const r of exported.rows)t=mul(t,dhMatrix({theta:r.theta0,d:r.d0,a:r.a,alpha:r.alpha,type:r.type,sign:1},qv));t=mul(t,exported.toolTransform);expect(poseError(t,dhFK(m,q).tip).position).toBeLessThan(1e-9);}expect(exported.sourceJoints.filter(j=>j.type==='fixed')).toHaveLength(2);});
});
