import {describe,it,expect} from 'vitest';
import {compareDH,referenceComparison,parseParameterRows,parseTransform} from '../src/core/comparison';
import {convertToDH} from '../src/core/dh';
import {examples} from '../src/core/examples';
import {identity,mul,rz} from '../src/core/math';

describe('personal DH equivalence comparison',()=>{
 for(const chain of examples)it('accepts computed parameters for '+chain.name,()=>{
  const reference=convertToDH(chain),candidate=referenceComparison(reference);
  const result=compareDH(chain,reference,candidate,{});
  expect(result.passed).toBe(true);expect(result.passedCount).toBe(152);
  expect(result.samples[2].label).toBe('Lower limits');expect(result.samples[3].label).toBe('Upper limits');
 });
 it('accepts different DH frame choices with compensating boundary transforms',()=>{
  const chain=examples.find(e=>e.id==='planar')!,reference=convertToDH(chain),candidate=referenceComparison(reference);
  candidate.base=mul(candidate.base,rz(.7));candidate.rows[0].theta-=.7;
  candidate.rows.at(-1)!.theta+=.2;candidate.tool=mul(rz(-.2),candidate.tool);
  expect(compareDH(chain,reference,candidate,{joint_1:.23,joint_2:-.8}).passed).toBe(true);
 });
 it('does not mistake a match at the zero pose for matching motion',()=>{
  const chain=examples[0],reference=convertToDH(chain),candidate=referenceComparison(reference);
  candidate.rows[0].sign=-1;
  const result=compareDH(chain,reference,candidate,{});
  expect(result.current.passed).toBe(true);expect(result.passed).toBe(false);expect(result.maxOrientation).toBeGreaterThan(.1);
 });
 it('detects changed lengths and prismatic motion direction',()=>{
  const chain=examples.find(e=>e.id==='mixed')!,reference=convertToDH(chain),candidate=referenceComparison(reference);
  candidate.rows.find(r=>r.type==='prismatic')!.sign=-1;
  expect(compareDH(chain,reference,candidate,{}).maxPosition).toBeGreaterThan(.1);
  const changed=referenceComparison(reference);changed.rows[0].a+=.01;
  expect(compareDH(chain,reference,changed,{}).current.position).toBeCloseTo(.01,10);
 });
 it('handles fixed chains and validates shapes, finite values and rigid transforms',()=>{
  const chain={...examples[0],joints:[]},reference=convertToDH(chain),candidate=referenceComparison(reference);
  expect(compareDH(chain,reference,candidate,{}).passed).toBe(true);
  candidate.tool[3]+=.1;expect(compareDH(chain,reference,candidate,{}).passed).toBe(false);
  const moving=convertToDH(examples[0]),invalid=referenceComparison(moving);
  invalid.rows[0].a=Infinity;expect(()=>compareDH(examples[0],moving,invalid,{})).toThrow(/finite/);
  invalid.rows=[];expect(()=>compareDH(examples[0],moving,invalid,{})).toThrow(/one DH row/);
  expect(()=>parseTransform('1 2','B')).toThrow(/16/);
  const reflected=identity();reflected[0]=-1;expect(()=>parseTransform(reflected.join(' '),'B')).toThrow(/right-handed/);
  expect(parseTransform(identity().join('\n'),'B')).toEqual(identity());
 });
 it('parses pasted tables with explicit angle units and rejects partial or invalid input',()=>{
  expect(parseParameterRows('90, 1, 2, -180\n0\t0\t3\t0',2,true)).toEqual([{theta:Math.PI/2,d:1,a:2,alpha:-Math.PI},{theta:0,d:0,a:3,alpha:0}]);
  expect(()=>parseParameterRows('0 0 0',1,false)).toThrow(/four/);
  expect(()=>parseParameterRows('0 0 0 0',2,false)).toThrow(/2 rows/);
  expect(()=>parseParameterRows('0 0 Infinity 0',1,false)).toThrow(/finite/);
 });
});
