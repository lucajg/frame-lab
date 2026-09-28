import {test,expect,type Page} from '@playwright/test';
import {task,chooseExample,settings,closeSettings} from './helpers';
const camera=(p:Page)=>p.evaluate(()=>(window as any).frameLab.getCamera());
const state=(p:Page)=>p.evaluate(()=>(window as any).frameLab.readState());
async function jointPoint(page:Page,name:string){const ndc=await page.evaluate(n=>{const app=(window as any).frameLab,g=app.getJointVisuals().find((j:any)=>j.name===n);return app.projectWorld(g.carriage??g.origin);},name);const b=(await page.locator('#viewport canvas').boundingBox())!;return {x:b.x+(ndc[0]+1)*b.width/2,y:b.y+(1-ndc[1])*b.height/2};}
async function orbit(page:Page,dx=70,dy=50){const b=(await page.locator('#viewport canvas').boundingBox())!,x=b.x+b.width*.7,y=b.y+b.height*.3;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
for(const projection of ['perspective','orthographic'])test('axis snaps retain world Z-up and predictable orbiting in '+projection,async({page})=>{
 await page.goto('/');await page.emulateMedia({reducedMotion:'reduce'});await task(page,'understand');await page.selectOption('#chain-context-mode','whole');
 if(projection==='orthographic'){await settings(page);await page.click('#projection');await closeSettings(page);}
 for(const axis of ['z','x','z']){
  await page.click('[data-look='+axis+']');const before=await camera(page);expect(before.up).toEqual([0,0,1]);await page.waitForTimeout(350);const settled=await camera(page);settled.position.forEach((v:number,i:number)=>expect(v).toBeCloseTo(before.position[i],9));
  await orbit(page,70,-65);await page.waitForTimeout(350);const after=await camera(page);expect(after.up).toEqual([0,0,1]);expect(after.position).not.toEqual(before.position);after.target.forEach((v:number,i:number)=>expect(v).toBeCloseTo(before.target[i],8));expect(after.position.every(Number.isFinite)).toBe(true);
 }
 await page.click('#fit');expect((await camera(page)).up).toEqual([0,0,1]);await settings(page);await page.click('#projection');await closeSettings(page);expect((await camera(page)).up).toEqual([0,0,1]);
});
test('snapping during orbit inertia stops the motion instead of drifting from the chosen axis',async({page})=>{
 await page.goto('/');await task(page,'understand');await orbit(page,150,80);await page.click('[data-look=x]');const before=await camera(page);await page.waitForTimeout(700);const after=await camera(page);after.position.forEach((v:number,i:number)=>expect(v).toBeCloseTo(before.position[i],10));
});
for(const projection of ['perspective','orthographic'])test('double clicks reliably select joints with all frame overlays in '+projection,async({page})=>{
 await page.goto('/');await settings(page);await page.selectOption('[data-scope=dhScope]','all');await page.selectOption('[data-scope=urdfScope]','all');await page.selectOption('[data-scope=labelScope]','all');if(projection==='orthographic')await page.click('#projection');await closeSettings(page);
 for(const n of [3,2,1,3,1,2]){const p=await jointPoint(page,'joint_'+n);await page.mouse.dblclick(p.x,p.y,{delay:45});await expect.poll(async()=>(await state(page)).selectedRow).toBe(n);}
 await chooseExample(page,'mixed');const point=await jointPoint(page,'joint_2');await page.mouse.dblclick(point.x,point.y);await expect.poll(async()=>(await state(page)).selectedRow).toBe(2);
});
test('reselecting a joint does not reset construction and dragging over it does not select',async({page})=>{
 await page.goto('/');await task(page,'understand');await page.selectOption('#chain-context-mode','whole');await page.locator('#scrubber').fill('2.4');await page.locator('#scrubber').dispatchEvent('input');const first=await jointPoint(page,'joint_1');await page.mouse.dblclick(first.x,first.y);await expect(page.locator('#scrubber')).toHaveValue('2.4');
 const second=await jointPoint(page,'joint_2');await page.mouse.move(second.x,second.y);await page.mouse.down();await page.mouse.move(second.x+90,second.y+60,{steps:6});await page.mouse.move(second.x,second.y,{steps:6});await page.mouse.up();expect((await state(page)).selectedRow).toBe(1);
 await page.mouse.click(first.x,first.y,{button:'right'});expect((await state(page)).selectedRow).toBe(1);
});
