import {type Chain,urdfFK} from './urdf';
import {position,type Vec3,norm,sub} from './math';
/** Marker dimensions are based only on immutable q=0 geometry, never the live pose. */
const cache=new WeakMap<Chain,number>();
export function referenceDisplayScale(chain:Chain):number{
 const saved=cache.get(chain);if(saved!==undefined)return saved;
 const home=urdfFK(chain),points=Object.values(home.links).map(position).concat([position(home.tip)]);
 const lo:Vec3=[Infinity,Infinity,Infinity],hi:Vec3=[-Infinity,-Infinity,-Infinity];
 for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
 const scale=Math.max(.7,norm(sub(hi,lo))*.35);cache.set(chain,scale);return scale;
}
