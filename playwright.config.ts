import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,
 use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:1100},headless:true,
  launchOptions:{executablePath:process.env.CHROME_PATH??(existsSync('/opt/google/chrome/chrome')?'/opt/google/chrome/chrome':undefined),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']},
  screenshot:'only-on-failure'},
 webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:true,timeout:30000},
 reporter:'list'
});
