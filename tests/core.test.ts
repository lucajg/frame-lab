import {describe,it,expect} from 'vitest';
import {origin,identity,mul,inverse,rotation,translation,poseError,position,point,column,dot,sub,norm,type Vec3} from '../src/core/math';
import {type Chain,urdfFK,validate} from '../src/core/urdf';
import {convertToDH,dhFK,commonNormal,constructionFrames,dhMatrix,verifyPose} from '../src/core/dh';
import {examples} from '../src/core/examples';
const close=(a:number,b=0,tol=1e-9)=>expect(Math.abs(a-b)).toBeLessThan(tol);
function samePose(a:number[],b:number[],tol=1e-9){const e=poseError(a,b);close(e.position,0,tol);close(e.orientation,0,tol);}
let seed=7321;function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}const rand=()=>2*random()-1;
describe('rigid transform convention',()=>{
 it('applies fixed-axis URDF RPY in the documented order',()=>{const m=origin([1,2,3],[Math.PI/2,0,Math.PI/2]);point(m,[0,1,0]).forEach((v,i)=>close(v,[1,2,4][i]));samePose(mul(m,inverse(m)),identity());});
 it('measures 180-degree rotation errors',()=>close(poseError(identity(),rotation([1,0,0],Math.PI)).orientation,Math.PI));
 it('normalizes nonunit URDF axes',()=>samePose(rotation([0,0,4],.5),rotation([0,0,1],.5)));
});
describe('common normal geometry',()=>{
 it('solves a skew pair',()=>{const g=commonNormal([0,0,0],[0,0,1],[2,0,3],[0,1,0],[1,0,0]);expect(g.axisCase).toBe('skew');expect(g.from).toEqual([0,0,3]);expect(g.to).toEqual([2,0,3]);close(dot(sub(g.to,g.from),[0,0,1]));close(dot(sub(g.to,g.from),[0,1,0]));});
 it('handles intersection',()=>{const g=commonNormal([0,0,0],[0,0,1],[0,0,1],[0,1,0],[1,0,0]);expect(g.axisCase).toBe('intersecting');close(norm(sub(g.from,g.to)));close(Math.abs(g.x[0]),1);});
 it('handles parallel and antiparallel axes',()=>{for(const s of [-1,1]){const g=commonNormal([0,0,0],[0,0,1],[2,0,3],[0,0,s],[1,0,0]);expect(g.axisCase).toBe('parallel');expect(g.to).toEqual([2,0,0]);}});
 it('retains x for coincident axes',()=>{const g=commonNormal([0,0,0],[0,0,1],[0,0,3],[0,0,1],[0,1,0]);expect(g.axisCase).toBe('coincident');expect(g.x).toEqual([0,1,0]);});
});
describe('independent URDF and DH kinematics',()=>{
 it('matches the analytic planar 2R position',()=>{const c=examples.find(e=>e.id==='planar')!,q={joint_1:.6,joint_2:-.9};const expected=[1.2*Math.cos(.6)+.9*Math.cos(-.3),1.2*Math.sin(.6)+.9*Math.sin(-.3),.4];const dh=convertToDH(c);close(dh.rows[0].a,1.2);close(dh.rows[0].alpha);position(urdfFK(c,q).tip).forEach((v,i)=>close(v,expected[i]));samePose(urdfFK(c,q).tip,dhFK(dh,q).tip);});
 for(const c of examples)it(c.name+': 100 poses preserve tool and every rigid attachment',()=>{const m=convertToDH(c);for(let k=0;k<100;k++){const q=Object.fromEntries(m.rows.map(r=>[r.joint,rand()*(r.type==='prismatic'?.3:Math.PI)]));const e=verifyPose(c,m,q),tol=c.id==='near'?1e-6:1e-8;close(e.position,0,tol);close(e.orientation,0,tol);close(e.attachmentPosition,0,tol);close(e.attachmentOrientation,0,tol);}expect(m.rows.length).toBe(c.joints.filter(j=>j.type!=='fixed').length);});
 it('handles all-fixed and empty chains',()=>{for(const joints of [[],[{...examples[0].joints[0],type:'fixed' as const}]]){const c={...examples[0],joints,tool:origin([.3,.2,.1],[.3,.4,.5])},m=convertToDH(c);expect(m.rows).toHaveLength(0);samePose(urdfFK(c).tip,dhFK(m).tip);}});
 it('matches random mixed chains across 1200 deterministic configurations',()=>{for(let k=0;k<120;k++){const count=1+Math.floor(random()*7);const c:Chain={id:'random',name:'random',description:'',lesson:'',base:'b',tool:origin([rand(),rand(),rand()],[rand(),rand(),rand()]),joints:Array.from({length:count},(_,i)=>({name:'j'+i,parent:i?'l'+(i-1):'b',child:'l'+i,type:(['revolute','prismatic','fixed','continuous'] as const)[Math.floor(random()*4)],axis:[rand(),rand(),rand()] as Vec3,origin:origin([rand(),rand(),rand()],[rand()*3,rand()*3,rand()*3])}))};const m=convertToDH(c);for(let t=0;t<10;t++){const q=Object.fromEntries(m.rows.map(r=>[r.joint,rand()]));const e=verifyPose(c,m,q);close(e.position,0,1e-7);close(e.orientation,0,1e-7);close(e.attachmentPosition,0,1e-7);}}});
 it('constructs orthogonal unit frames',()=>{for(const c of examples)for(const f of convertToDH(c).referenceFrames){close(norm(column(f,0)),1);close(dot(column(f,0),column(f,2)));}});
});
describe('construction animation',()=>{
 it('ends at the DH matrix for all rows and nonzero q',()=>{for(const c of examples){const m=convertToDH(c);for(const row of m.rows){const start=origin([.2,-.5,.8],[.2,.3,-.4]),f=constructionFrames(start,row,.7,4);expect(f).toHaveLength(5);samePose(f[4],mul(start,dhMatrix(row,.7)),1e-8);expect(constructionFrames(start,row,.7,0)).toEqual([start]);}}});
 it('interpolates operations and clamps endpoints',()=>{const row={...convertToDH(examples[0]).rows[0],theta:1,d:2,a:3,alpha:-.5};samePose(constructionFrames(identity(),row,0,.5).at(-1)!,rotation([0,0,1],.5));samePose(constructionFrames(identity(),row,0,1.5).at(-1)!,mul(rotation([0,0,1],1),translation([0,0,1])));samePose(constructionFrames(identity(),row,0,99).at(-1)!,dhMatrix(row));expect(constructionFrames(identity(),row,0,-1)).toEqual([identity()]);});
});
describe('validation',()=>{
 it('rejects zero axes and disconnected chains',()=>{expect(()=>convertToDH({...examples[0],joints:[{...examples[0].joints[0],axis:[0,0,0]}]})).toThrow(/Axis/);expect(()=>validate({...examples[0],joints:[{...examples[0].joints[0],parent:'missing'}]})).toThrow(/connected/);});
 it('rejects reflections, invalid limits and nonfinite positions',()=>{expect(()=>validate({...examples[0],tool:[-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]})).toThrow(/right-handed/);expect(()=>validate({...examples[0],joints:[{...examples[0].joints[0],limits:[2,-2]}]})).toThrow(/limits/);expect(()=>urdfFK(examples[0],{joint_1:NaN})).toThrow(/finite/);expect(()=>dhFK(convertToDH(examples[0]),{joint_1:Infinity})).toThrow(/finite/);});
});

it('rejects transform arithmetic overflow instead of accepting nonfinite geometry',()=>{
 const chain={...examples[0],joints:[{...examples[0].joints[0],type:'fixed' as const,origin:origin([1e308,0,0])},{...examples[0].joints[1],type:'fixed' as const,origin:origin([1e308,0,0])}]};
 expect(()=>convertToDH(chain)).toThrow(/overflow/);
});
