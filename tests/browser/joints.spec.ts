import {task,details,chooseExample,openFiles,settings,closeSettings,joints,table} from './helpers';
import {test,expect} from '@playwright/test';

test('rotary cylinder axes follow upstream joint rotation and retain their dimensions',async({page})=>{
 await page.goto('/');
 const glyphs=()=>page.evaluate(()=>(window as any).frameLab.getJointVisuals());
 const initial=await glyphs(),second=initial.find((g:any)=>g.name==='joint_2');
 second.axis.forEach((v:number,i:number)=>expect(v).toBeCloseTo([0,1,0][i],10));
 await joints(page);await page.locator('[data-joint="joint_1"]').fill('90');await joints(page);await page.locator('[data-joint="joint_1"]').dispatchEvent('input');
 const rotated=(await glyphs()).find((g:any)=>g.name==='joint_2');
 rotated.axis.forEach((v:number,i:number)=>expect(v).toBeCloseTo([-1,0,0][i],10));expect(rotated.dimensions).toEqual(second.dimensions);
 await joints(page);await page.locator('[data-joint="joint_2"]').fill('-90');await joints(page);await page.locator('[data-joint="joint_2"]').dispatchEvent('input');
 const ownMotion=(await glyphs()).find((g:any)=>g.name==='joint_2');
 ownMotion.axis.forEach((v:number,i:number)=>expect(v).toBeCloseTo(rotated.axis[i],10));expect(ownMotion.dimensions).toEqual(second.dimensions);expect(ownMotion.rotorIndex).not.toEqual(rotated.rotorIndex);
 await expect(page.locator('#verification-status')).toHaveText('Models agree');
 await task(page,'move');
 await page.screenshot({path:'test-results/revolute-glyphs.png'});
});
test('prismatic carriage moves by signed q and remains aligned with its axis',async({page})=>{
 await page.goto('/');await chooseExample(page,'mixed');await page.selectOption('#joint-selector','1');
 const glyph=()=>page.evaluate(()=>(window as any).frameLab.getJointVisuals().find((g:any)=>g.name==='joint_2'));
 await joints(page);await page.locator('[data-joint="joint_2"]').fill('-0.2');await joints(page);await page.locator('[data-joint="joint_2"]').dispatchEvent('input');const a=await glyph();
 await joints(page);await page.locator('[data-joint="joint_2"]').fill('0.6');await joints(page);await page.locator('[data-joint="joint_2"]').dispatchEvent('input');const b=await glyph();
 expect(a.origin).toEqual(b.origin);expect(a.dimensions).toEqual(b.dimensions);
 b.carriage.forEach((v:number,i:number)=>expect(v-a.carriage[i]).toBeCloseTo(.8*b.axis[i],10));
 await expect(page.locator('#verification-status')).toHaveText('Models agree');
 await task(page,'move');
 await page.screenshot({path:'test-results/prismatic-glyphs.png'});
});
