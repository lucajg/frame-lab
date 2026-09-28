import {stableViewDirection,SelectionGesture,pickJoint} from './view-interaction';
import {sceneThemes,type SceneTheme} from './theme';
import {type Presentation} from './core/workspace';
import {createJointGlyph,jointGlyphMetrics} from './joint-glyphs';
import {type CameraSnapshot} from './core/session';
import {referenceDisplayScale} from './core/display';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer,CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {type Chain,urdfFK} from './core/urdf';
import {type DHModel,dhFK,evaluated,constructionFrames} from './core/dh';
import {type Mat4,type Vec3,position,column,point,direction,mul,inverse,add,scale,norm,sub,identity} from './core/math';

export interface ViewState {chain:Chain;model:DHModel;q:Record<string,number>;selected:number;focus:boolean;mode:'joint'|'construction';progress:number;degrees:boolean;layers:Record<string,boolean>;hiddenFrames:Set<string>;presentation?:Presentation}

const vec=(v:Vec3)=>new THREE.Vector3(...v);
const fmt=(x:number)=>Math.abs(x)<.00005?'0':x.toFixed(3);
export class RobotView {
 scene=new THREE.Scene();content=new THREE.Group();renderer:THREE.WebGLRenderer;labels=new CSS2DRenderer();
 perspective=new THREE.PerspectiveCamera(40,1,.001,1e9);orthographic=new THREE.OrthographicCamera(-3,3,3,-3,.001,1e9);
 camera:THREE.PerspectiveCamera|THREE.OrthographicCamera=this.perspective;controls:OrbitControls;
 state?:ViewState;private colors:SceneTheme=sceneThemes.black;private grid:THREE.GridHelper;private billboards:THREE.Object3D[]=[];private labelsDirty=true;private leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');private scale=1;private picks:THREE.Object3D[]=[];private resizeObserver:ResizeObserver;private selectionGesture=new SelectionGesture();
 constructor(private host:HTMLElement,private select:(i:number)=>void){
  this.scene.background=new THREE.Color(this.colors.background);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  this.renderer.domElement.setAttribute('aria-label','Interactive 3D robot. Drag to orbit, scroll to zoom. Select joints using the DH table.');
  this.renderer.domElement.tabIndex=0;host.append(this.renderer.domElement);
  this.labels.domElement.className='scene-labels';this.labels.domElement.style.position='absolute';this.labels.domElement.style.inset='0';this.labels.domElement.style.pointerEvents='none';host.append(this.labels.domElement);this.leaders.classList.add('label-leaders');this.leaders.setAttribute('aria-hidden','true');host.append(this.leaders);
  this.perspective.up.set(0,0,1);this.orthographic.up.set(0,0,1);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.addEventListener('change',()=>{this.labelsDirty=true;});this.controls.zoomToCursor=true;this.controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.controls.dampingFactor=.12;this.controls.minDistance=.05;this.controls.maxDistance=1e8;
  this.scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,-4,7);this.scene.add(light);this.scene.add(this.content);
  const grid=this.grid=new THREE.GridHelper(12,24,this.colors.grid,this.colors.grid);grid.rotation.x=Math.PI/2;grid.position.z=-.015;this.scene.add(grid);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
  const canvas=this.renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{this.selectionGesture.down(e.pointerId,e.clientX,e.clientY,e.button,e.isPrimary,e.pointerType==='touch',this.pick(e.clientX,e.clientY,e.pointerType==='touch'?14:9));});
  canvas.addEventListener('pointermove',e=>{this.selectionGesture.move(e.pointerId,e.clientX,e.clientY);canvas.style.cursor=this.selectionGesture.active?'grabbing':this.pick(e.clientX,e.clientY)!==undefined?'pointer':'grab';});
  canvas.addEventListener('pointerup',e=>{const row=this.selectionGesture.up(e.pointerId,e.clientX,e.clientY);if(row!==undefined)this.select(row);canvas.style.cursor='grab';});
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>this.selectionGesture.cancel((e as PointerEvent).pointerId));
  this.renderer.setAnimationLoop(()=>{this.controls.update();for(const ring of this.billboards)ring.quaternion.copy(this.camera.quaternion);this.renderer.render(this.scene,this.camera);this.labels.render(this.scene,this.camera);if(this.labelsDirty){this.arrangeLabels();this.labelsDirty=false;}});
 }
 private pick(clientX:number,clientY:number,padding=9){const b=this.renderer.domElement.getBoundingClientRect();return pickJoint(this.picks,this.camera,clientX-b.left,clientY-b.top,b.width,b.height,padding);}
 // Drain pending damping before an explicit view command, then install a fresh pose.
 private placeCamera(change:()=>void){const damping=this.controls.enableDamping,position=this.camera.position.clone(),target=this.controls.target.clone(),quaternion=this.camera.quaternion.clone(),zoom=this.camera.zoom;this.controls.enableDamping=false;this.controls.update();this.camera.position.copy(position);this.camera.quaternion.copy(quaternion);this.controls.target.copy(target);this.camera.zoom=zoom;this.camera.updateProjectionMatrix();change();this.camera.up.set(0,0,1);this.controls.update();this.controls.enableDamping=damping;this.labelsDirty=true;}
 setTheme(theme:'light'|'black'){this.colors=sceneThemes[theme];this.scene.background=new THREE.Color(this.colors.background);const mats=Array.isArray(this.grid.material)?this.grid.material:[this.grid.material];mats.forEach(m=>{m.vertexColors=false;m.color.setHex(this.colors.grid);m.needsUpdate=true;});if(this.state)this.update(this.state);}
 private resize(){this.labelsDirty=true;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.labels.setSize(w,h);this.perspective.aspect=w/h;this.perspective.updateProjectionMatrix();const half=(this.orthographic.top-this.orthographic.bottom)/2;this.orthographic.left=-half*w/h;this.orthographic.right=half*w/h;this.orthographic.updateProjectionMatrix();}
 private arrangeLabels(){
  // Move HTML annotations only. Leaders preserve the connection to exact 3D anchors.
  const hostRect=this.host.getBoundingClientRect(),w=hostRect.width,h=hostRect.height;
  const objects:CSS2DObject[]=[];this.content.traverse(o=>{if(o instanceof CSS2DObject)objects.push(o);});
  const rank=(o:CSS2DObject)=>o.element.matches('.dimension,.angle-label')?0:o.element.classList.contains('frame-label')?1:o.element.classList.contains('axis-letter')?3:2;
  objects.sort((a,b)=>rank(a)-rank(b));objects.forEach(o=>{o.element.style.translate='0px 0px';o.element.style.visibility='';});
  const occupied:{left:number;top:number;right:number;bottom:number}[]=[];this.leaders.replaceChildren();
  for(const o of objects){
   const el=o.element;if(el.style.display==='none')continue;
   const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   const base={left:rect.left-hostRect.left,top:rect.top-hostRect.top,right:rect.right-hostRect.left,bottom:rect.bottom-hostRect.top};
   const anchor=o.getWorldPosition(new THREE.Vector3()).project(this.camera);
   if(Math.abs(anchor.x)>1.05||Math.abs(anchor.y)>1.05)continue;
   const candidates:[[number,number],...Array<[number,number]>]=[[0,0]];
   if(!el.classList.contains('axis-letter'))for(const radius of [26,52,78,104,140])for(const [x,y] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]])candidates.push([x*radius,y*radius]);
   let chosen:[number,number]=[0,0],best=Infinity;
   for(const [dx,dy] of candidates){
    const r={left:base.left+dx,top:base.top+dy,right:base.right+dx,bottom:base.bottom+dy};
    if(r.left<7||r.right>w-7||r.top<8||r.bottom>h-28)continue;
    let overlap=0;for(const p of occupied)overlap+=Math.max(0,Math.min(r.right+5,p.right)-Math.max(r.left-5,p.left))*Math.max(0,Math.min(r.bottom+5,p.bottom)-Math.max(r.top-5,p.top));
    const score=overlap*100+Math.hypot(dx,dy);if(score<best){best=score;chosen=[dx,dy];}if(overlap===0)break;
   }
   if(best>=100&&!el.matches('.dimension,.angle-label')){el.style.visibility='hidden';continue;}
   const [dx,dy]=chosen;el.style.translate=dx+'px '+dy+'px';const placed={left:base.left+dx,top:base.top+dy,right:base.right+dx,bottom:base.bottom+dy};occupied.push(placed);
   if(Math.hypot(dx,dy)>10){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',String((anchor.x*.5+.5)*w));line.setAttribute('y1',String((-anchor.y*.5+.5)*h));line.setAttribute('x2',String((placed.left+placed.right)/2));line.setAttribute('y2',String((placed.top+placed.bottom)/2));this.leaders.append(line);}
  }
 }
 private clear(){this.labelsDirty=true;this.leaders.replaceChildren();this.content.traverse(o=>{if(o instanceof CSS2DObject)o.element.remove();const mesh=o as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();if(mesh.material){const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(m=>m.dispose());}});this.content.clear();this.picks=[];this.billboards=[];}
 private label(text:string,p:Vec3,kind='',row?:number){
  const el=document.createElement(row===undefined?'span':'button');el.className='scene-label '+kind;el.textContent=text;
  if(row!==undefined){el.style.pointerEvents='auto';el.setAttribute('aria-label','Select DH row '+(row+1));el.addEventListener('click',event=>{const click=event as MouseEvent;this.select(click.detail===0?row:this.pick(click.clientX,click.clientY)??row);});}
  const o=new CSS2DObject(el);o.position.copy(vec(p));this.content.add(o);return o;
 }
 private line(points:Vec3[],color:number,dashed=false,opacity=1){
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(vec));
  const material=dashed?new THREE.LineDashedMaterial({color,dashSize:this.scale*.075,gapSize:this.scale*.045,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const line=new THREE.Line(geometry,material);if(dashed)line.computeLineDistances();this.content.add(line);return line;
 }
 private arrow(a:Vec3,b:Vec3,color:number,opacity=1){
  const d=sub(b,a),length=norm(d);if(length<1e-10)return;
  const arrow=new THREE.ArrowHelper(vec(d).normalize(),vec(a),length,color,Math.min(length*.3,this.scale*.075),Math.min(length*.13,this.scale*.035));
  for(const o of [arrow.line,arrow.cone]){const mat=o.material as THREE.Material;mat.transparent=true;mat.opacity=opacity;}this.content.add(arrow);return arrow;
 }
 private sphere(p:Vec3,r:number,color:number,row?:number){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.15}));mesh.position.copy(vec(p));if(row!==undefined){mesh.userData.row=row;this.picks.push(mesh);}this.content.add(mesh);
 }
 private rod(a:Vec3,b:Vec3,color:number,r:number,opacity=1){const d=sub(b,a),len=norm(d);if(len<1e-9)return;const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,12),new THREE.MeshStandardMaterial({color,roughness:.6,transparent:opacity<1,opacity}));mesh.position.copy(vec(add(a,scale(d,.5))));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vec(d).normalize());this.content.add(mesh);}
 private axes(m:Mat4,name:string,length:number,opacity=1,row?:number,showLabel=true){
  const p=position(m);[this.colors.x,this.colors.y,this.colors.z].forEach((c,i)=>{const end=add(p,scale(column(m,i),length));const a=this.arrow(p,end,c,opacity);if(a){a.userData.frameName=name;a.userData.axisLength=length;}if(opacity>.6)this.label(['x','y','z'][i],add(end,scale(column(m,i),length*.16)),'axis-letter');});
  if(opacity>.6&&showLabel)this.label(name,add(p,[0,0,-length*.27]),name.startsWith('U')?'urdf-label':'frame-label',row);
 }
 private dimension(a:Vec3,b:Vec3,text:string,color:number=this.colors.gold){if(norm(sub(b,a))>1e-9){this.arrow(a,b,color);this.sphere(a,this.scale*.014,color);}this.label(text,add(scale(add(a,b),.5),[0,0,this.scale*.08]),'dimension');}
 private arc(m:Mat4,axis:'z'|'x',angle:number,text:string){
  const radius=this.scale*.3,points:Vec3[]=[];const steps=Math.min(256,Math.max(8,Math.ceil(Math.abs(angle)*24)));
  for(let i=0;i<=steps;i++){const a=angle*(i/steps);points.push(point(m,axis==='z'?[radius*Math.cos(a),radius*Math.sin(a),0]:[0,radius*Math.cos(a),radius*Math.sin(a)]));}
  if(Math.abs(angle)>1e-8){this.line(points,this.colors.gold);this.arrow(points[Math.max(0,steps-2)],points[steps],this.colors.gold);}
  const a=angle/2;this.label(text,point(m,axis==='z'?[radius*1.25*Math.cos(a),radius*1.25*Math.sin(a),0]:[0,radius*1.25*Math.cos(a),radius*1.25*Math.sin(a)]),'angle-label');
 }
 update(state:ViewState){
  this.state=state;this.clear();const {chain,model,q,selected,focus,layers,hiddenFrames}=state;
  const u=urdfFK(chain,q),d=dhFK(model,q),active=chain.joints.filter(j=>j.type!=='fixed'),row=model.rows[selected];
  this.scale=referenceDisplayScale(chain);
  this.grid.visible=layers.grid!==false;const presentation=state.presentation;
  const scope=(s:string|undefined,selected:boolean)=>s!=='none'&&(s!=='selected'||selected);
  const faded=presentation?.context==='fade';
  const len=this.scale*.32;let prev:Vec3=[0,0,0];
  const selectedIndex=chain.joints.findIndex(j=>j.name===active[selected]?.name),nextIndex=chain.joints.findIndex(j=>j.name===active[selected+1]?.name);
  chain.joints.forEach((j,jointIndex)=>{
   const p=position(u.links[j.child]),i=active.findIndex(a=>a.name===j.name);
   if(layers.links&&(!focus||(jointIndex>selectedIndex&&jointIndex<=nextIndex)))this.rod(prev,p,this.colors.link,this.scale*.026,focus?.55:faded?.18:.85);prev=p;
   if(!focus||i===selected||i===selected+1){
    if(layers.glyphs!==false){const glyph=createJointGlyph(j,u.before[j.name],Object.hasOwn(q,j.name)?q[j.name]:0,this.scale,i===selected,this.colors);
    if(i>=0){glyph.traverse(o=>o.userData.row=i);this.picks.push(glyph);}if(layers.guides===false)glyph.traverse(o=>{if(['prismatic-guide','prismatic-stop'].includes(o.name))o.visible=false;});
    glyph.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.material){const mat=mesh.material as THREE.MeshStandardMaterial;if(faded&&i!==selected&&i!==selected+1){mat.transparent=true;mat.opacity=.15;}}});this.content.add(glyph);}
    if(layers.urdf&&scope(presentation?.urdfScope,i===selected||i===selected+1)&&!hiddenFrames.has('u'+j.child))this.axes(u.links[j.child],'U · '+j.child,len*.8,.85,i>=0?i:undefined,scope(presentation?.labelScope,i===selected||i===selected+1));
   }
  });
  if(layers.links&&!focus)this.rod(prev,position(u.tip),this.colors.link,this.scale*.022);
  if(layers.axes)active.forEach((j,i)=>{if((focus&&i!==selected&&i!==selected+1)||!scope(presentation?.axisScope,i===selected||(state.mode==='construction'&&i===selected+1)))return;const p=position(u.before[j.name]),z=direction(u.before[j.name],j.axis),n=scale(z,1/norm(z));this.line([add(p,scale(n,-this.scale*.65)),add(p,scale(n,this.scale*.95))],i===selected?this.colors.gold:this.colors.z,true,.85);});
  if(layers.dh)d.frames.forEach((f,i)=>{if(hiddenFrames.has('f'+i)||(focus&&i!==selected&&i!==selected+1)||!scope(presentation?.dhScope,i===selected||i===selected+1))return;this.axes(f,'F'+i,len,1,Math.max(0,i-1),scope(presentation?.labelScope,i===selected||i===selected+1));});
  if(layers.normals&&row){
   // Reference common normal is rigidly attached to the body after joint i.
   const motion=mul(u.links[row.child],inverse(urdfFK(chain).links[row.child]));
   const a=point(motion,row.from),b=point(motion,row.to);
   this.line([a,b],this.colors.gold,false,1);this.sphere(a,this.scale*.025,this.colors.gold);if(norm(sub(a,b))>1e-9)this.sphere(b,this.scale*.025,this.colors.gold);
   this.label(row.axisCase==='terminal'?'Terminal frame':norm(sub(a,b))<1e-9?'a = 0 · axes meet':'Common normal',add(scale(add(a,b),.5),[0,0,-this.scale*.13]),'normal-label');
   if(layers.axes&&row.axisCase!=='terminal'){this.line([position(d.frames[selected]),a],this.colors.z,true,.6);this.line([position(d.frames[selected+1]),b],this.colors.z,true,.6);}
  }
  if(row&&layers.dimensions){
   const val=evaluated(row,q[row.joint]??0),steps=constructionFrames(d.frames[selected],row,q[row.joint]??0,4);
   const angle=(v:number)=>state.degrees?fmt(v*180/Math.PI)+'°':fmt(v)+' rad';
   const show=(i:number)=>!presentation||presentation.allParameters||i===Math.min(3,Math.floor(state.progress));
   if(show(0))this.arc(steps[0],'z',val.theta,'θ '+angle(val.theta));if(show(1))this.dimension(position(steps[1]),position(steps[2]),'d '+fmt(val.d)+' m');
   if(show(2))this.dimension(position(steps[2]),position(steps[3]),'a '+fmt(val.a)+' m');if(show(3))this.arc(steps[3],'x',val.alpha,'α '+angle(val.alpha));
  }
  if(row&&state.mode==='construction'&&layers.ghost){
   const frames=constructionFrames(d.frames[selected],row,q[row.joint]??0,state.progress);
   if(!presentation||presentation.history)frames.slice(1,-1).forEach((f,i)=>this.axes(f,'Step '+(i+1),len*.7,.25));
   this.axes(frames.at(-1)!,'Construction',len*1.35,1);
  }
  if(layers.tool&&!focus){this.axes(u.tip,'Tool · URDF',len*.85,1);const tip=position(d.tip);const ring=new THREE.Mesh(new THREE.TorusGeometry(this.scale*.085,this.scale*.012,8,32),new THREE.MeshBasicMaterial({color:this.colors.teal}));ring.position.copy(vec(tip));ring.quaternion.copy(this.camera.quaternion);this.content.add(ring);this.billboards.push(ring);this.label('DH tool',add(tip,[0,0,this.scale*.2]),'tool-label');}
 }
 fit(all=false,whole=false,pair=false){
  if(!this.state)return;const s=this.state,u=urdfFK(s.chain,s.q),d=dhFK(s.model,s.q);let points=Object.values(u.links).map(position).concat([position(u.tip)]);
  if((pair||s.focus&&!whole&&!all)&&s.model.rows.length){points=[position(d.frames[s.selected]),position(d.frames[s.selected+1])];const active=s.chain.joints.filter(j=>j.type!=='fixed');for(const j of active.slice(s.selected,s.selected+2))points.push(position(u.before[j.name]));}
  else if(all)points.push(...d.frames.map(position));
  const box=new THREE.Box3().setFromPoints(points.map(vec)).expandByScalar(this.scale*.4),center=box.getCenter(new THREE.Vector3()),size=Math.max(.8,box.getSize(new THREE.Vector3()).length());
  const aspect=this.host.clientWidth/this.host.clientHeight;const distance=size*((pair||s.focus&&!whole)?1.15:1.25)/Math.min(1,aspect);
  this.placeCamera(()=>{this.camera.zoom=1;this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.camera.position.copy(center.clone().add(new THREE.Vector3(1.1,-1.6,1.05).normalize().multiplyScalar(distance)));
  this.orthographic.top=size*.75;this.orthographic.bottom=-size*.75;this.resize();});
 }
 projection(){this.placeCamera(()=>{const old=this.camera;this.camera=old===this.perspective?this.orthographic:this.perspective;this.camera.position.copy(old.position);this.camera.quaternion.copy(old.quaternion);this.camera.up.set(0,0,1);this.controls.object=this.camera;this.resize();});return this.camera===this.orthographic;}
 lookAlong(axis:'z'|'x'){
  if(!this.state||!this.state.model.rows.length)return;
  const d=dhFK(this.state.model,this.state.q),f=d.frames[this.state.selected+(axis==='x'?1:0)],target=vec(position(f));
  const offset=this.camera.position.clone().sub(this.controls.target),direction=stableViewDirection(vec(column(f,axis==='x'?0:2)),offset);
  const distance=Math.max(this.scale*3,offset.length());
  this.placeCamera(()=>{this.controls.target.copy(target);this.camera.position.copy(target.clone().add(direction.multiplyScalar(distance)));});
 }
 home(){this.camera.up.set(0,0,1);this.fit();}
 cameraSnapshot():CameraSnapshot{return {projection:this.camera===this.orthographic?'orthographic':'perspective',position:this.camera.position.toArray() as Vec3,target:this.controls.target.toArray() as Vec3,up:this.camera.up.toArray() as Vec3,zoom:this.camera.zoom,halfHeight:this.orthographic.top};}
 restoreCamera(s:CameraSnapshot){
  this.placeCamera(()=>{
   this.camera=s.projection==='orthographic'?this.orthographic:this.perspective;this.controls.object=this.camera;
   this.camera.position.fromArray(s.position);this.controls.target.fromArray(s.target);this.camera.zoom=s.zoom;
   // Older sessions may contain a joint-relative up vector; orbit navigation is now always world Z-up.
   this.camera.up.set(0,0,1);this.orthographic.top=s.halfHeight;this.orthographic.bottom=-s.halfHeight;this.resize();this.camera.updateProjectionMatrix();
  });
 }
 cursorAnchor(x:number,y:number){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),this.camera);const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()),this.controls.target);return ray.ray.intersectPlane(plane,new THREE.Vector3())?.toArray();}
 projectWorld(p:Vec3){return vec(p).project(this.camera).toArray();}
 getRenderState(){return {background:(this.scene.background as THREE.Color).getHexString(),gridVisible:this.grid.visible,zoomToCursor:this.controls.zoomToCursor,visibleGuides:this.content.children.flatMap(g=>{const guides:string[]=[];g.traverse(o=>{if(o.visible&&o.name==='prismatic-guide')guides.push(o.name);});return guides;}).length,billboards:this.billboards.map(r=>({alignment:Math.abs(r.quaternion.dot(this.camera.quaternion)),position:r.position.toArray()})),cameraQuaternion:this.camera.quaternion.toArray()};}
 getJointVisuals(){return this.content.children.filter((o):o is THREE.Group=>o instanceof THREE.Group&&typeof o.userData.jointName==='string').map(jointGlyphMetrics);}
 getVisualMetrics(){const frameLengths:Record<string,number[]>=Object.create(null);this.content.traverse(o=>{if(o instanceof THREE.ArrowHelper&&o.userData.frameName){(frameLengths[o.userData.frameName]??=[]).push(o.cone.position.y*o.getWorldScale(new THREE.Vector3()).y);}});return {scale:this.scale,frameLengths};}
 dispose(){this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.controls.dispose();this.clear();this.renderer.dispose();}
}
