import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const root='data/demo-video-work';fs.mkdirSync(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--window-size=1480,940']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:810}});
 const page=await context.newPage(); await page.goto('http://localhost:3200/login');
 console.log('RECORDING_LOGIN_WINDOW_OPEN: complete email sign-in here; no video is recording.');
 await page.waitForURL('**/dashboard',{timeout:900000});
 await expect(page.getByRole('heading',{name:'Everything in balance.'})).toBeVisible();
 const state=await context.storageState();
 console.log('AUTH_READY: recording session held in memory; secret values withheld.');
 while(!fs.existsSync(root+'/record-ready.json'))await new Promise(r=>setTimeout(r,1000));
 await context.close();
 const {recordDemo}=await import('./record-demo.mjs');
 await recordDemo(browser,state);
}finally{await browser.close()}
