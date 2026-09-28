import {dhFK, dhMatrix, type DHModel, type DHRow} from './dh';
import {mul, poseError, type Mat4} from './math';
import {motionRange, numeric} from './robot';
import {assertRigid, type Chain} from './urdf';

export type ComparisonRow = Pick<DHRow, 'joint'|'type'|'theta'|'d'|'a'|'alpha'> & {sign: 1|-1};
export interface ComparisonModel {rows: ComparisonRow[]; base: Mat4; tool: Mat4}
export const comparisonTolerance = 1e-7;

export function referenceComparison(model: DHModel): ComparisonModel {
 return {rows: model.rows.map(({joint,type,theta,d,a,alpha,sign})=>({joint,type,theta,d,a,alpha,sign})),base:[...model.base],tool:[...model.tool]};
}

export function parseTransform(text: string, label: string): Mat4 {
 const values=text.trim().split(/[\s,;]+/).map(v=>numeric(v,label));
 if(values.length!==16)throw Error(label+' requires 16 numbers, in row order.');
 try{assertRigid(values);}catch(error){throw Error(label+': '+(error as Error).message);}
 return values;
}

/** Paste values at q=0, in theta, d, a, alpha order; motion is added separately. */
export function parseParameterRows(text: string, count: number, degrees: boolean) {
 const lines=text.trim().split(/\r?\n/).filter(line=>line.trim());
 if(lines.length!==count)throw Error('Expected '+count+' rows, one per moving joint (no header).');
 return lines.map((line,i)=>{
  const parts=line.trim().split(/[\s,;]+/);
  if(parts.length!==4)throw Error('Row '+(i+1)+' requires four numbers: theta, d, a, alpha.');
  const [theta,d,a,alpha]=parts.map(v=>numeric(v,'Row '+(i+1)));
  const factor=degrees?Math.PI/180:1;
  return {theta:theta*factor,d,a,alpha:alpha*factor};
 });
}

export function compareDH(chain: Chain, reference: DHModel, candidate: ComparisonModel, currentQ: Record<string,number>) {
 if(candidate.rows.length!==reference.rows.length)throw Error('Use one DH row per moving joint.');
 assertRigid(candidate.base);assertRigid(candidate.tool);
 candidate.rows.forEach((r,i)=>{
  if(r.joint!==reference.rows[i].joint||r.type!==reference.rows[i].type)throw Error('Rows must follow the source joint order and types.');
  if(![r.theta,r.d,r.a,r.alpha].every(Number.isFinite)||![1,-1].includes(r.sign))throw Error('DH parameters must be finite and joint signs must be +1 or −1.');
 });
 const evaluate=(q:Record<string,number>)=>{
  let tip=candidate.base;
  for(const row of candidate.rows){
   const value=q[row.joint]??0;if(!Number.isFinite(value))throw Error('Joint positions must be finite.');
   tip=mul(tip,dhMatrix({...row,sign:1},value*row.sign));
  }
  tip=mul(tip,candidate.tool);
  const referenceTip=dhFK(reference,q).tip;
  const error=poseError(referenceTip,tip);
  if(![...tip,...referenceTip,error.position,error.orientation].every(Number.isFinite))throw Error('Transform arithmetic overflow. Reduce the parameter magnitudes.');
  return {...error,passed:error.position<=comparisonTolerance&&error.orientation<=comparisonTolerance};
 };
 let seed=3419;
 const configurations: {label:string;q:Record<string,number>}[]=[{label:'Current pose',q:{...currentQ}},{label:'q = 0',q:Object.fromEntries(reference.rows.map(r=>[r.joint,0]))}];
 for(let i=0;i<150;i++){
  const q:Record<string,number>=Object.create(null);
  for(const row of reference.rows){
   const joint=chain.joints.find(j=>j.name===row.joint)!;
   const [lo,hi]=motionRange(joint);seed=(1664525*seed+1013904223)>>>0;
   q[row.joint]=lo+(hi-lo)*(i===0?0:i===1?1:seed/4294967296);
  }
  configurations.push({label:i===0?'Lower limits':i===1?'Upper limits':'Sample '+(i-1),q});
 }
 const samples=configurations.map(c=>({...c,...evaluate(c.q)}));
 return {samples,current:samples[0],passed:samples.every(s=>s.passed),passedCount:samples.filter(s=>s.passed).length,
  maxPosition:Math.max(...samples.map(s=>s.position)),maxOrientation:Math.max(...samples.map(s=>s.orientation))};
}
