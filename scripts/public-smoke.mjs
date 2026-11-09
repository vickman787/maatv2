import fs from 'node:fs';
import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://localhost:3200';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext(); const page=await context.newPage();
 fs.mkdirSync('docs/screenshots',{recursive:true});
 for(const width of [1920,1440,1024,768,390,320]) {
  await page.setViewportSize({width,height:900}); await page.goto(origin);
  await expect(page.locator('.landing-nav').getByRole('link',{name:/Sign in/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Explore demo/})).toHaveCount(0);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow at '+width);
  await page.screenshot({path:'docs/screenshots/public-landing-'+width+'.png',fullPage:true});
 }
 await page.getByRole('link',{name:'How it works',exact:true}).click();
 await expect(page.getByRole('heading',{name:'From two CSVs to a defensible close.'})).toBeInViewport();
 for(const route of ['/api/demo/start','/api/demo/reset'])if((await context.request.post(origin+route)).status()!==404)throw Error('Legacy demo route remains active');
 for(const route of ['/samples/invoices-sample.csv','/samples/payments-sample.csv'])if((await context.request.get(origin+route)).status()!==404)throw Error('Public samples remain');
 await page.locator('.landing-nav').getByRole('link',{name:/Sign in/}).click();
 await expect(page.getByRole('heading',{name:'Welcome back.',exact:true})).toBeVisible();
 await page.goto(origin+'/dashboard'); await expect(page).toHaveURL(/\/login/);
 console.log(JSON.stringify({origin,status:'passed',checks:['six viewport widths','guest sign-in','workflow anchor','no public demo routes','no public sample files','private dashboard authentication']}));
}finally{await browser.close()}
