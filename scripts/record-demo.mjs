import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {expect} from '@playwright/test';
const origin='http://localhost:3200';
const root=path.resolve('data/demo-video-work');
const scenes=[];
const save=()=>fs.writeFileSync(path.join(root,'capture.json'),JSON.stringify({origin,clock:'anchored immediately before page creation; verify source frames before editing',scenes},null,2));
async function click(page,locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();if(b)await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.waitForTimeout(180);await locator.click();}
async function contextShot(browser,name,state,viewport,callback){
 const context=await browser.newContext({...(state?{storageState:state}:{}),viewport,recordVideo:{dir:path.join(root,'raw'),size:viewport},acceptDownloads:true});
 const anchor=performance.now(); const page=await context.newPage(); const video=page.video();
 await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const dot=document.createElement('div');dot.setAttribute('data-recording-pointer','');dot.style.cssText='position:fixed;left:-100px;top:-100px;width:18px;height:18px;border:2px solid #b99655;border-radius:50%;background:#b9965528;pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%)';document.body.appendChild(dot);document.addEventListener('mousemove',e=>{dot.style.left=e.clientX+'px';dot.style.top=e.clientY+'px'});document.addEventListener('mousedown',()=>{dot.style.background='#b9965580'});document.addEventListener('mouseup',()=>{dot.style.background='#b9965528'})})});
 async function mark(id,duration,action,crop){const scene={id,video:name+'.webm',start:(performance.now()-anchor)/1000,end:0,duration,...(crop?{crop}:{} )};scenes.push(scene);try{await action(scene);const elapsed=(performance.now()-anchor)/1000-scene.start;if(elapsed<duration)await page.waitForTimeout((duration-elapsed)*1000);}finally{scene.end=(performance.now()-anchor)/1000;save();}await page.screenshot({path:path.join(root,id+'.png'),fullPage:false});console.log('RECORDED '+id+' '+scene.start.toFixed(2)+'–'+scene.end.toFixed(2));}
 try{await callback(page,context,mark)}finally{await context.close();const actual=await video.path();fs.renameSync(actual,path.join(root,name+'.webm'));save()}
}
export async function recordDemo(browser,state){
 await contextShot(browser,'intro',null,{width:1440,height:810},async(page,context,mark)=>{
  await page.goto(origin);await expect(page.getByRole('heading',{level:1})).toBeVisible();await page.waitForTimeout(1000);
  await mark('intro',12,async()=>{await page.mouse.move(450,300,{steps:20});await page.waitForTimeout(4000);await click(page,page.getByRole('link',{name:'How it works',exact:true}));await page.waitForTimeout(2500);await page.mouse.wheel(0,-650);await page.waitForTimeout(1200)});
 });
 let reviewUrl,batchUrl;
 await contextShot(browser,'workflow',state,{width:1440,height:810},async(page,context,mark)=>{
  await page.goto(origin+'/dashboard');await expect(page.getByRole('heading',{name:'No reconciliations yet.'})).toBeVisible();await page.waitForTimeout(900);
  await mark('empty',12,async()=>{await page.mouse.move(650,440,{steps:20});await page.waitForTimeout(6500);await click(page,page.getByRole('link',{name:'New reconciliation',exact:true}));await expect(page.getByRole('heading',{name:'Start with your source files.'})).toBeVisible()},[244,68,1196,742]);
  await mark('upload',20,async()=>{
   await page.getByLabel('Batch name').fill('');await page.getByLabel('Batch name').pressSequentially('November reconciliation',{delay:65});
   await page.locator('#invoices-file').setInputFiles(path.join(root,'invoices-demo.csv'));await page.waitForTimeout(900);
   await page.locator('#payments-file').setInputFiles(path.join(root,'payments-demo.csv'));await page.waitForTimeout(1200);
   await page.mouse.wheel(0,400);await page.waitForTimeout(2500);await click(page,page.getByRole('button',{name:/Validate & match/}));
   await page.waitForURL(/\/batches\/[0-9a-f-]{36}$/,{timeout:90000});batchUrl=page.url();fs.writeFileSync(path.join(root,'case.json'),JSON.stringify({batchUrl},null,2));
  },[244,68,1196,742]);
  await expect(page.getByText('9 exact matches')).toBeVisible({timeout:90000});
  await mark('matching',13,async()=>{await page.mouse.move(850,420,{steps:20});await page.waitForTimeout(5000);await page.mouse.wheel(0,250);await page.waitForTimeout(1500);await page.mouse.wheel(0,-250)},[244,68,1196,742]);
  await click(page,page.getByRole('tab',{name:/Partial/}));await page.waitForURL('**?filter=partial');await click(page,page.getByRole('row').filter({hasText:'INV-010'}).getByRole('link',{name:/Review/}));
  await expect(page.getByRole('heading',{name:'Invoice INV-010',exact:true})).toBeVisible();reviewUrl=page.url();
  fs.writeFileSync(path.join(root,'case.json'),JSON.stringify({batchUrl,reviewUrl},null,2));
  await mark('evidence',14,async()=>{await click(page,page.getByText('Original invoice CSV row',{exact:true}));await page.waitForTimeout(3500);await click(page,page.getByText('Original invoice CSV row',{exact:true}));await page.mouse.wheel(0,400);await page.waitForTimeout(2000);await click(page,page.getByText('Original candidate payment CSV row',{exact:true}));await page.waitForTimeout(2200);await click(page,page.getByText('Original candidate payment CSV row',{exact:true}))},[244,68,1196,742]);
  await expect.poll(async()=>{await page.reload();return page.getByText('AI advice only—not an allocation.',{exact:true}).count()},{timeout:120000,intervals:[3000]}).toBeGreaterThan(0);
  const ai=page.locator('.suggestion-box');await ai.scrollIntoViewIfNeeded();await page.waitForTimeout(900);const ab=await ai.boundingBox();const ac=[Math.max(0,Math.floor(ab.x-22)),Math.max(0,Math.floor(ab.y-40)),Math.min(1150,1440-Math.max(0,Math.floor(ab.x-22))),Math.min(600,810-Math.max(0,Math.floor(ab.y-40)))];
  await mark('ai',20,async()=>{await expect(page.getByText('Provider: Vultr Serverless Inference',{exact:true})).toBeVisible();await page.mouse.move(ab.x+ab.width*.5,ab.y+70,{steps:20});await page.waitForTimeout(6500);await page.mouse.move(ab.x+100,ab.y+ab.height-45,{steps:30});},ac);
  await page.mouse.wheel(0,-1500);await page.waitForTimeout(900);
  await mark('confirm',14,async()=>{await page.locator('input[type=checkbox]').check();await page.waitForTimeout(1800);await click(page,page.getByRole('button',{name:/Save confirmed allocation/}));await expect(page.getByRole('status')).toContainText(/Allocation confirmed/i);await page.waitForTimeout(2200);await page.mouse.wheel(0,-1200);await page.waitForTimeout(900)},[244,68,1196,742]);
  await click(page,page.getByRole('link',{name:'Back to batch',exact:true}));await expect(page.getByRole('link',{name:/Export report/})).toBeVisible();
  await mark('report',17,async()=>{await click(page,page.getByRole('link',{name:/Export report/}));await expect(page.getByText('$14,500',{exact:true}).first()).toBeVisible();await page.waitForTimeout(4200);const [download]=await Promise.all([page.waitForEvent('download'),click(page,page.getByRole('link',{name:'Download reconciliation.csv',exact:true}))]);await download.saveAs(path.join(root,'recorded-reconciliation.csv'));await page.waitForTimeout(2200)},[244,68,1196,742]);
  await page.goto(reviewUrl);await page.waitForTimeout(800);
  await mark('undo',13,async()=>{await click(page,page.getByRole('button',{name:'Undo',exact:true}));await page.waitForTimeout(1300);await click(page,page.getByRole('button',{name:'Confirm undo',exact:true}));await expect(page.getByRole('status')).toContainText(/undone/i);await page.waitForTimeout(1500);await page.getByRole('heading',{name:'Review history',exact:true}).scrollIntoViewIfNeeded();await page.waitForTimeout(2500)},[244,68,1196,742]);
 });
 await contextShot(browser,'mobile',state,{width:390,height:844},async(page,context,mark)=>{await page.goto(origin+'/dashboard');await expect(page.getByRole('heading',{name:'Everything in balance.'})).toBeVisible();await page.waitForTimeout(800);await mark('mobile',6,async()=>{await page.mouse.wheel(0,280);await page.waitForTimeout(1800);await page.mouse.wheel(0,-280)})});
 await contextShot(browser,'ending',null,{width:1440,height:810},async(page,context,mark)=>{await page.goto(origin);await expect(page.getByRole('heading',{level:1})).toBeVisible();await page.waitForTimeout(800);await mark('ending',9,async()=>{await page.mouse.move(550,320,{steps:20});await page.waitForTimeout(2000);await page.mouse.move(750,450,{steps:25})})});
 console.log('CAPTURE_COMPLETE '+path.join(root,'capture.json'));
}
