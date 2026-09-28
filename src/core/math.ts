/** Right-handed rigid transforms, row-major storage, column-vector convention. */
export type Vec3 = [number, number, number];
export type Mat4 = number[];
export const add = (a: Vec3,b: Vec3):Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub = (a: Vec3,b: Vec3):Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale = (a: Vec3,s: number):Vec3 => [a[0]*s,a[1]*s,a[2]*s];
export const dot = (a: Vec3,b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross = (a: Vec3,b: Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const norm = (a: Vec3) => Math.hypot(...a);
export function unit(a: Vec3):Vec3 { const n=norm(a); if(!Number.isFinite(n)||n<1e-15) throw Error('Axis must be finite and nonzero.'); return scale(a,1/n); }
export const identity = ():Mat4 => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function mul(a:Mat4,b:Mat4):Mat4 { const c=Array(16).fill(0); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)c[4*i+j]+=a[4*i+k]*b[4*k+j]; return c; }
export const position = (m:Mat4):Vec3 => [m[3],m[7],m[11]];
export const column = (m:Mat4,j:number):Vec3 => [m[j],m[4+j],m[8+j]];
export const direction = (m:Mat4,v:Vec3):Vec3 => [0,1,2].map(i=>m[4*i]*v[0]+m[4*i+1]*v[1]+m[4*i+2]*v[2]) as Vec3;
export const point = (m:Mat4,v:Vec3):Vec3 => add(direction(m,v),position(m));
export function inverse(m:Mat4):Mat4 { const r=identity(); for(let i=0;i<3;i++){for(let j=0;j<3;j++)r[4*i+j]=m[4*j+i];r[4*i+3]=-dot(column(m,i),position(m));} return r; }
export function translation(v:Vec3):Mat4 {const m=identity(); [m[3],m[7],m[11]]=v;return m;}
export function rotation(axis:Vec3,q:number):Mat4 { const [x,y,z]=unit(axis),c=Math.cos(q),s=Math.sin(q),v=1-c;return [x*x*v+c,x*y*v-z*s,x*z*v+y*s,0,y*x*v+z*s,y*y*v+c,y*z*v-x*s,0,z*x*v-y*s,z*y*v+x*s,z*z*v+c,0,0,0,0,1]; }
export const rx=(q:number)=>rotation([1,0,0],q);
export const rz=(q:number)=>rotation([0,0,1],q);
/** URDF fixed-axis roll/pitch/yaw: Rz(yaw) Ry(pitch) Rx(roll). */
export const origin=(xyz:Vec3=[0,0,0],rpy:Vec3=[0,0,0])=>mul(translation(xyz),mul(rz(rpy[2]),mul(rotation([0,1,0],rpy[1]),rx(rpy[0]))));
export function frame(p:Vec3,x:Vec3,z:Vec3):Mat4 { z=unit(z);x=unit(sub(x,scale(z,dot(x,z))));const y=cross(z,x);return [x[0],y[0],z[0],p[0],x[1],y[1],z[1],p[1],x[2],y[2],z[2],p[2],0,0,0,1]; }
export function perpendicular(z:Vec3):Vec3 {const candidates:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]];const seed=candidates.sort((a,b)=>Math.abs(dot(a,z))-Math.abs(dot(b,z)))[0];return unit(sub(seed,scale(z,dot(seed,z))));}
export function poseError(a:Mat4,b:Mat4){const r=mul(inverse(a),b);const sine=Math.hypot(r[9]-r[6],r[2]-r[8],r[4]-r[1])/2;return {position:norm(sub(position(a),position(b))),orientation:Math.atan2(sine,Math.max(-1,Math.min(1,(r[0]+r[5]+r[10]-1)/2)))};}
