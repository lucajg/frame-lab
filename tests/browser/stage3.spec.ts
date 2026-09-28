import {task,details,chooseExample,openFiles,settings,closeSettings,joints,table} from './helpers';
import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dhMatrix} from '../../src/core/dh';
import {mul,position} from '../../src/core/math';

const fixture=readFileSync(new URL('../fixtures/branched.urdf',import.meta.url),'utf8');
function sameMarkers(actual:{scale:number;frameLengths:Record<string,number[]>},expected:{scale:number;frameLengths:Record<string,number[]>}){
 expect(actual.scale).toBe(expected.scale);
 expect(Object.keys(actual.frameLengths)).toEqual(Object.keys(expected.frameLengths));
 for(const [name,lengths] of Object.entries(actual.frameLengths))lengths.forEach((length,i)=>expect(length).toBeCloseTo(expected.frameLengths[name][i],12));
}
async function importArm(page:Page){
 await openFiles(page,'import');await page.fill('#urdf-text',fixture);await page.click('#inspect-urdf');await page.selectOption('#tip-link','tool');await page.screenshot({path:'test-results/stage3-import.png'});await page.click('#open-chain');
}
async function downloadJSON(page:Page,button:string){const pending=page.waitForEvent('download');await page.click(button);const download=await pending;return JSON.parse(await readFile((await download.path())!,'utf8'));}

test('frame marker geometry stays constant through revolute/prismatic motion and pair focus',async({page})=>{
 await page.goto('/');await joints(page);await settings(page);await page.check('[data-layer=dh]');await page.selectOption('[data-scope=dhScope]','all');await closeSettings(page);const metrics=()=>page.evaluate(()=>(window as any).frameLab.getVisualMetrics());
 const original=await metrics();
 for(const joint of ['joint_1','joint_2','joint_3'])for(const value of ['75','-130','0']){await joints(page);await page.locator('[data-joint="'+joint+'"]').fill(value);await joints(page);await page.locator('[data-joint="'+joint+'"]').dispatchEvent('input');sameMarkers(await metrics(),original);}
 await task(page,'understand');await details(page);await page.selectOption('#chain-context-mode','isolate');const focused=await metrics();expect(focused.scale).toBe(original.scale);focused.frameLengths.F0.forEach((v:number,i:number)=>expect(v).toBeCloseTo(original.frameLengths.F0[i],12));
 await chooseExample(page,'mixed');await task(page,'understand');await details(page);await page.selectOption('#chain-context-mode','isolate');const prism=await metrics();await joints(page);await page.locator('[data-joint="joint_2"]').fill('0.65');await joints(page);await page.locator('[data-joint="joint_2"]').dispatchEvent('input');sameMarkers(await metrics(),prism);
});
test('imports a branched URDF, selects internal chains and preserves fixed adapters',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await importArm(page);
 await expect(page.locator('#scene-title')).toHaveText('Imported teaching arm');await expect(page.locator('#dh-rows tr')).toHaveCount(2);await expect(page.locator('#scene-status')).toContainText('1 fixed adapters');
 await expect(page.locator('[data-q-label="slide"]')).toHaveText('0.100 m');await joints(page);await page.locator('[data-joint="slide"]').fill('0.5');await joints(page);await page.locator('[data-joint="slide"]').dispatchEvent('input');await expect(page.locator('#verification-status')).toHaveText('Models agree');
 await task(page,'check');await details(page);await page.click('#sweep');await expect(page.locator('#sweep-result')).toContainText('150 / 150 passed');
 await openFiles(page,'import');await expect(page.locator('#import-warnings')).toContainText('not needed or fetched');await page.selectOption('#base-link','arm');await page.selectOption('#tip-link','tool');await page.click('#open-chain');
 await expect(page.locator('#dh-rows tr')).toHaveCount(1);await expect(page.locator('#example-description')).toHaveText('arm → tool');expect(errors).toEqual([]);
});
test('uploads URDF and reports errors without replacing the working robot',async({page})=>{
 await page.goto('/');await openFiles(page,'import');
 await page.locator('#urdf-file').setInputFiles({name:'bad.urdf',mimeType:'application/xml',buffer:Buffer.from(fixture.replace('type="revolute"','type="floating"'))});
 await expect(page.locator('#file-status')).toContainText('unsupported type floating');await expect(page.locator('#scene-title')).toHaveText('Spatial elbow');
 await page.locator('#urdf-file').setInputFiles({name:'arm.urdf',mimeType:'application/xml',buffer:Buffer.from(fixture)});
 await expect(page.locator('#pending-robot-name')).toHaveText('Imported teaching arm');await page.selectOption('#tip-link','tool');await page.click('#open-chain');
 await openFiles(page,'session');await page.locator('#session-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"format":"frame-lab-session","version":999}')});
 await expect(page.locator('#file-status')).toContainText('Unsupported session');await expect(page.locator('#scene-title')).toHaveText('Imported teaching arm');
});
test('edits a serial chain, generates links, applies tool offsets, and rejects invalid axes',async({page})=>{
 await page.goto('/');await openFiles(page,'editor');await page.click('#new-chain');await page.fill('#editor-name','My mixed mechanism');await page.click('#add-joint');await page.click('#add-joint');await page.click('#add-joint');
 await page.getByLabel('Joint 1 rpy',{exact:true}).fill('0.2 -0.4 0.3');await page.getByLabel('Joint 1 axis',{exact:true}).fill('1 1 0');
 await page.getByLabel('Joint 2 type',{exact:true}).selectOption('prismatic');await page.getByLabel('Joint 2 lower',{exact:true}).fill('0.1');await page.getByLabel('Joint 2 upper',{exact:true}).fill('0.8');
 await page.getByLabel('Joint 3 type',{exact:true}).selectOption('fixed');await page.fill('#tool-xyz','0.4 0.1 0.2');await page.fill('#tool-rpy','0.3 -0.2 0.1');await page.screenshot({path:'test-results/stage3-editor.png'});await page.click('#apply-editor');
 await expect(page.locator('#scene-title')).toHaveText('My mixed mechanism');await expect(page.locator('#scene-status')).toContainText('2 moving joints · 1 fixed adapters');await expect(page.locator('[data-q-label="joint_2"]')).toHaveText('0.100 m');
 await task(page,'check');await details(page);await page.click('#sweep');await expect(page.locator('#sweep-result')).toContainText('150 / 150 passed');
 await openFiles(page,'editor');await page.getByLabel('Joint 1 axis',{exact:true}).fill('0 0 0');await page.click('#apply-editor');await expect(page.locator('#file-status')).toContainText('nonzero');await expect(page.locator('#scene-title')).toHaveText('My mixed mechanism');
 await page.getByLabel('Joint 1 axis',{exact:true}).fill('1 0 0');await page.locator('[data-move="2"][data-delta="-1"]').click();await expect(page.getByLabel('Joint 2 type',{exact:true})).toHaveValue('fixed');await page.locator('[data-remove="1"]').click();await page.click('#apply-editor');await expect(page.locator('#scene-status')).toContainText('2 moving joints · 0 fixed adapters');
 await openFiles(page,'import');await page.selectOption('#base-link','link_1');await page.click('#open-chain');await openFiles(page,'export');const exported=await downloadJSON(page,'#export-dh');expect(exported.sourceToolOffset[3]).toBe(.4);expect(exported.sourceToolOffset[7]).toBe(.1);expect(exported.sourceToolOffset[11]).toBe(.2);
});
test('session download/reload preserves tree, tool, pose, construction state, visibility and camera',async({page})=>{
 await page.goto('/');await importArm(page);await joints(page);await page.locator('[data-joint="slide"]').fill('0.31');await joints(page);await page.locator('[data-joint="slide"]').dispatchEvent('input');await page.selectOption('#joint-selector','1');await task(page,'understand');await details(page);await page.selectOption('#chain-context-mode','isolate');await task(page,'understand');await details(page);await page.locator('#scrubber').fill('2.3');await page.locator('#scrubber').dispatchEvent('input');await settings(page);await page.click('#units');await settings(page);await page.click('#projection');
 await page.locator('summary').filter({hasText:'Individual frames'}).click();await page.locator('[data-frame="f0"]').uncheck();
 await closeSettings(page);await openFiles(page,'session');const before=await page.evaluate(()=>(window as any).frameLab.readState());const saved=await downloadJSON(page,'#save-session');expect(saved.robot.links).toContain('sensor');expect(saved.q.slide).toBe(.31);expect(saved.view.camera.projection).toBe('orthographic');expect(saved.view.workspace.tasks.understand.hiddenFrames).toContain('f0');
 await page.click('#close-files');await chooseExample(page,'planar');await openFiles(page,'session');await page.locator('#session-file').setInputFiles({name:'lesson.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await expect(page.locator('#robot-dialog')).not.toBeVisible();
 const after=await page.evaluate(()=>(window as any).frameLab.readState());expect(after).toEqual(before);await expect(page.locator('#scrubber')).toHaveValue('2.3');await expect(page.locator('#units')).toHaveText('Radians');await expect(page.locator('#projection')).toHaveText('Orthographic');await task(page,'understand');await settings(page);await expect(page.locator('[data-frame="f0"]')).not.toBeChecked();await closeSettings(page);
 const camera=await page.evaluate(()=>(window as any).frameLab.getCamera());camera.position.forEach((v:number,i:number)=>expect(v).toBeCloseTo(saved.view.camera.position[i],8));
 await openFiles(page,'import');await expect(page.locator('#base-link option')).toHaveCount(5);
});
test('DH export includes reference parameters, units, joint mappings and reconstructible boundaries',async({page})=>{
 await page.goto('/');await importArm(page);await joints(page);await page.locator('[data-joint="slide"]').fill('0.42');await joints(page);await page.locator('[data-joint="slide"]').dispatchEvent('input');const expected=await page.evaluate(()=>(window as any).frameLab.getToolPositions());
 await openFiles(page,'export');const data=await downloadJSON(page,'#export-dh');
 expect(data.convention).toBe('standard DH');expect(data.units).toEqual({length:'meter',angle:'radian'});expect(data.rows[1].sourceJoint).toBe('slide');expect(data.rows[1].variable).toContain('d = d0');expect(data.sourceJoints.map((j:any)=>j.type)).toContain('fixed');
 let t=data.baseTransform;for(const r of data.rows)t=mul(t,dhMatrix({theta:r.theta0,d:r.d0,a:r.a,alpha:r.alpha,type:r.type,sign:r.qSign},data.currentConfiguration.q[r.sourceJoint]));t=mul(t,data.toolTransform);position(t).forEach((v,i)=>expect(v).toBeCloseTo(expected.urdf[i],9));
});
test('fixed-only and empty paths remain usable without phantom movable joints',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await openFiles(page,'import');await page.fill('#urdf-text',fixture);await page.click('#inspect-urdf');await page.selectOption('#tip-link','sensor');await page.click('#open-chain');
 await expect(page.locator('#pair-title')).toHaveText('Fixed chain');await expect(page.locator('#fit-pair')).toBeDisabled();await expect(page.locator('#verification-status')).toHaveText('Models agree');await page.click('#fit');
 await openFiles(page,'import');await page.selectOption('#base-link','sensor');await page.click('#open-chain');await expect(page.locator('#scene-status')).toContainText('0 moving joints · 0 fixed adapters');await task(page,'check');await details(page);await page.click('#sweep');await expect(page.locator('#verification-status')).toHaveText('Models agree');expect(errors).toEqual([]);
});
test('untrusted imported names remain inert text',async({page})=>{
 await page.goto('/');await openFiles(page,'import');await page.fill('#urdf-text',fixture.replace('name="Imported teaching arm"','name="&lt;img src=x onerror=alert(1)&gt;"').replaceAll('shoulder','constructor').replaceAll('base','__proto__'));await page.click('#inspect-urdf');await page.selectOption('#tip-link','tool');await page.click('#open-chain');
 await expect(page.locator('#scene-title')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('#app img')).toHaveCount(0);await expect(page.locator('#verification-status')).toHaveText('Models agree');
});
test('stage 3 dialog works on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await openFiles(page,'editor');
 expect(await page.locator('#robot-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.screenshot({path:'test-results/stage3-mobile.png',fullPage:true});
 await page.click('#tab-import');await page.click('#sample-urdf');await page.click('#inspect-urdf');await page.selectOption('#tip-link','tip');await page.click('#open-chain');await expect(page.locator('#scene-title')).toHaveText('My arm');
});
