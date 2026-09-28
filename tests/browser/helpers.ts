import {type Page} from '@playwright/test';
export async function task(page:Page,name:'model'|'move'|'understand'|'check'){await page.click('[data-task="'+name+'"]');}
export async function details(page:Page){if(!await page.locator('#task-inspector').isVisible())await page.click('#toggle-inspector');}
export async function chooseExample(page:Page,id:string){await task(page,'model');await details(page);await page.selectOption('#example',id);}
export async function openFiles(page:Page,kind:'import'|'editor'|'session'|'export'){await task(page,kind==='import'||kind==='editor'?'model':'check');await details(page);await page.click('#open-'+kind);}
export async function settings(page:Page){if(!await page.locator('#view-dialog').isVisible())await page.click('#open-settings');}
export async function closeSettings(page:Page){await page.click('#view-dialog [data-close-dialog]');}
export async function joints(page:Page){if(!await page.locator('#joint-panel').isVisible())await page.click('#toggle-joints');if(await page.locator('#expand-joints').getAttribute('aria-pressed')!=='true')await page.click('#expand-joints');}
export async function table(page:Page){if(!await page.locator('#table-dock').isVisible())await page.click('#toggle-table');}
