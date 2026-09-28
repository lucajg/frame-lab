import {test,expect} from '@playwright/test';
import {task,details,chooseExample,settings,closeSettings,joints,table} from './helpers';
test('renders a real WebGL scene and all mechanisms pass motion verification',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#viewport canvas')).toBeVisible();await expect(page.locator('.webgl-error')).toHaveCount(0);
 const box=await page.locator('#joint-controls').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(1100);
 for(const id of ['skew','planar','intersecting','parallel','coincident','mixed','adapters','near']){await chooseExample(page,id);await task(page,'check');await expect(page.locator('#verification-status')).toHaveText('Models agree');await page.click('#sweep');await expect(page.locator('#sweep-result')).toContainText('150 / 150 passed');}
 expect(errors).toEqual([]);await chooseExample(page,'skew');await page.screenshot({path:'test-results/desktop.png'});
});
test('joint sliders, table selection, pair isolation and construction stay synchronized',async({page})=>{
 await page.goto('/');await page.locator('[data-joint="joint_1"]').fill('45');await page.locator('[data-joint="joint_1"]').dispatchEvent('input');await expect(page.locator('[data-q-label="joint_1"]')).toHaveText('45.0°');
 await table(page);await page.getByRole('button',{name:'Select joint 2',exact:true}).click();await task(page,'understand');await expect(page.locator('#pair-title')).toHaveText('F1 → F2');await expect(page.locator('#scene-status')).toContainText('other joints hidden');await expect(page.locator('#construction-bar')).toBeVisible();
 for(let i=0;i<4;i++)await page.click('#next-step');await expect(page.locator('#construction-explanation')).toContainText('Complete:');
 await page.click('#restart');await page.click('#play');await expect(page.locator('#play')).toHaveText('Pause');await expect.poll(async()=>Number(await page.locator('#scrubber').inputValue())).toBeGreaterThan(.1);
 await page.click('#play');await page.locator('#scrubber').fill('2.5');await page.locator('#scrubber').dispatchEvent('input');await expect(page.locator('#progress-label')).toHaveText('2.5 / 4');await expect(page.locator('#construction-explanation')).toContainText('common normal');
 await expect.poll(async()=>page.evaluate(()=>{const labels=Array.from(document.querySelectorAll('.scene-label:not(.axis-letter)')).filter(e=>getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden').map(e=>e.getBoundingClientRect());let overlaps=0;for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps++;}return overlaps;})).toBe(0);
 await page.screenshot({path:'test-results/construction.png'});await task(page,'move');await page.click('#reset');await expect(page.locator('[data-q-label="joint_1"]')).toHaveText('0°');
});
test('units, prismatic controls, visibility and camera controls work',async({page})=>{
 await page.goto('/');await chooseExample(page,'mixed');await page.selectOption('#joint-selector','1');await page.locator('[data-joint="joint_2"]').fill('0.3');await page.locator('[data-joint="joint_2"]').dispatchEvent('input');await expect(page.locator('[data-q-label="joint_2"]')).toHaveText('0.300 m');
 await task(page,'understand');await settings(page);await page.click('#units');await expect(page.locator('#units')).toHaveText('Radians');await expect(page.locator('[data-q-label="joint_2"]')).toHaveText('0.300 m');
 await page.locator('[data-layer="dh"]').uncheck();await expect(page.locator('.frame-label').filter({hasText:/^F[0-9]+$/})).toHaveCount(0);await page.locator('[data-layer="dh"]').check();await expect(page.locator('.frame-label').first()).toBeVisible();
 await page.getByText('Individual frames',{exact:true}).click();await page.locator('[data-frame="f1"]').uncheck();await expect(page.locator('.frame-label').filter({hasText:/^F1$/})).toHaveCount(0);await page.click('#projection');await expect(page.locator('#projection')).toHaveText('Orthographic');await page.click('#fit-all');await closeSettings(page);
 await page.click('[data-look="z"]');await page.click('[data-look="x"]');await page.click('#fit');await page.check('#all-parameters');await expect(page.locator('.dimension,.angle-label')).toHaveCount(4);
});
test('mobile layout has no page overflow and all controls remain reachable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.selectOption('#joint-selector','1');await task(page,'understand');await expect(page.locator('#pair-title')).toHaveText('F1 → F2');await page.screenshot({path:'test-results/mobile.png'});
 await table(page);await expect(page.locator('#task-inspector')).toBeHidden();await page.getByRole('button',{name:'Inspect d for joint 2',exact:true}).click();await expect(page.locator('#task-inspector')).toBeVisible();await expect(page.locator('#table-dock')).toBeHidden();await expect(page.locator('.parameter-card.active')).toContainText('Tz(d)');
});
test('optional page tools validate inputs atomically and share visible app state',async({page})=>{
 await page.addInitScript(()=>{const registered:Record<string,any>={};Object.defineProperty(document,'modelContext',{value:{registerTool:(tool:any)=>{registered[tool.name]=tool;}}});(window as any).registeredTools=registered;});await page.goto('/');
 const result=await page.evaluate(async()=>{const t=(window as any).registeredTools;const names=Object.keys(t);const good=await t.configure_kinematics_lab.execute({example:'mixed',row:2,focus:true,q:{joint_2:.3}});let rejected=false;try{await t.configure_kinematics_lab.execute({example:'skew',row:99});}catch{rejected=true;}return {names,good,rejected,after:t.read_kinematics_lab.execute({})};});
 expect(result.names).toEqual(['read_kinematics_lab','configure_kinematics_lab']);expect(result.good.example).toBe('mixed');expect(result.good.selectedRow).toBe(2);expect(result.rejected).toBe(true);expect(result.after).toEqual(result.good);await expect(page.locator('#example')).toHaveValue('mixed');await expect(page.locator('#pair-title')).toHaveText('F1 → F2');await expect(page.locator('[data-q-label="joint_2"]')).toHaveText('0.300 m');
});
