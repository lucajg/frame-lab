import {test,expect} from '@playwright/test';
import {task} from './helpers';

for(const width of [1440,1100,820,390])test('details never reposition the scene toolbar at '+width+'px',async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');await task(page,'understand');
 const bounds=async()=>Promise.all(['.scene-toolbar','#fit','#fit-pair','#toggle-inspector','#toggle-table','#toggle-joints'].map(s=>page.locator(s).boundingBox()));
 const before=await bounds();await page.click('#toggle-inspector');expect(await bounds()).toEqual(before);await page.click('#toggle-inspector');expect(await bounds()).toEqual(before);
 const toolbar=(await page.locator('.scene-toolbar').boundingBox())!,inspector=(await page.locator('#task-inspector').boundingBox())!;
 expect(inspector.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height);
 expect(await page.locator('.brand #model-context').count()).toBe(0);await expect(page.locator('.model-nav #model-context')).toHaveText('Spatial elbow');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/layout-'+width+'.png'});
});

test('custom DH editor compares, invalidates stale results, converts units and keeps drafts',async({page})=>{
 await page.goto('/');await task(page,'check');await page.click('#open-comparison');
 await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Agreement within tolerance');
 await page.selectOption('#comparison-units','degrees');await expect(page.locator('#comparison-result')).toBeHidden();await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Agreement within tolerance');
 await page.getByLabel('Joint 1 sign',{exact:true}).selectOption('-1');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Differences found');await expect(page.locator('#comparison-result')).toContainText('Current orientation error0.000e+0 rad');
 await page.getByLabel('Joint 1 a',{exact:true}).fill('0.9');await expect(page.locator('#comparison-result')).toBeHidden();await page.locator('#comparison-dialog [data-close-dialog]').click();await page.click('#open-comparison');await expect(page.getByLabel('Joint 1 a',{exact:true})).toHaveValue('0.9');
 await page.getByLabel('Joint 1 a',{exact:true}).fill('');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Joint 1 a must be a finite number');await expect(page.locator('#comparison-result')).toBeHidden();
 await page.click('#comparison-copy');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Agreement within tolerance');await page.screenshot({path:'test-results/comparison-desktop.png'});
});

test('pasting parameters and editing boundary transforms works on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await task(page,'check');await page.click('#open-comparison');
 await page.getByText('Paste a parameter table',{exact:true}).click();await page.fill('#comparison-paste','0 0 0 0');await page.click('#comparison-apply-paste');await expect(page.locator('#comparison-message')).toContainText('Expected 3 rows');
 await page.fill('#comparison-paste','0 0 0 0\n0 0 0 0\n0 0 0 0');await page.click('#comparison-apply-paste');await expect(page.getByLabel('Joint 1 theta',{exact:true})).toHaveValue('0');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Differences found');
 await page.click('#comparison-copy');await page.locator('#comparison-boundaries summary').click();await page.fill('#comparison-base','1 0 0 0\n0 1 0 0\n0 0 1 0\n0 0 0 0');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Base transform B');
 await page.click('#comparison-copy-transforms');await page.click('#comparison-run');await expect(page.locator('#comparison-message')).toContainText('Agreement within tolerance');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/comparison-mobile.png'});
});
