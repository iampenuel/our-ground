// Exercise a complete pointer gesture while a location suggestion is pending.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const server=await createServer({server:{host:'127.0.0.1',port:4317,strictPort:true},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();
 await page.route('**/filter-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><form></form>
 <style>[hidden],#locationStatus:empty{display:none}#locationStatus:not(:empty){min-height:70px}button{height:32px}</style>
 <script type="module">
 import {mountLocationCombobox,locationSearchMarkup} from '/src/location-combobox.ts';
 const form=document.querySelector('form');form.innerHTML=locationSearchMarkup('')+'<button type="button" id="healthcare">Healthcare</button>';
 const box=mountLocationCombobox(document.querySelector('#locationControl'),{transport:{suggest:()=>new Promise(()=>{}),retrieve:()=>{}},resolvePoint:()=>{},selected:()=>{},invalidated:()=>{}});box.setEnabled(true);
 document.querySelector('#healthcare').onclick=e=>e.currentTarget.setAttribute('aria-pressed','true');
 </script>`}));
 await page.goto('http://127.0.0.1:4317/filter-fixture');await page.locator('#locationInput').fill('Harrisburg');
 await page.waitForFunction(()=>document.querySelector('#locationStatus')?.textContent.trim().length>0);
 await page.getByRole('button',{name:'Healthcare',exact:true}).click();
 assert.equal(await page.locator('#healthcare').getAttribute('aria-pressed'),'true','Dismissal must not move a pressed filter before click');
 console.log('PASS: pending location notice did not swallow the Healthcare click.');
}finally{await browser?.close();await server.close()}
