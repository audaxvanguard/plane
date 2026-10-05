import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT || '/source';
const work=process.cwd();
const result=await build({stdin:{contents:`import { CustomFieldStore } from '${root}/apps/web/core/store/project/custom-field.store.ts'; export async function check(){const store=new CustomFieldStore(); await store.fetchFields('test','A'); await store.fetchFields('test','B'); const before=store.getFields('A').map(f=>f.id); const second=store.getFields('B').map(f=>f.id); store.invalidateProject('A'); return {before,second,after:store.getFields('A')};}`,resolveDir:root},bundle:true,write:false,format:'iife',globalName:'fixture',alias:{axios:work+'/node_modules/axios/dist/browser/axios.cjs',mobx:work+'/node_modules/mobx','@plane/constants':root+'/packages/constants/src/endpoints.ts','@/services/api.service':root+'/apps/web/core/services/api.service.ts'},define:{'process.env.VITE_API_BASE_URL':'""','process.env.NODE_ENV':'"development"','process.env':'{}'}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  page.on('pageerror',error=>console.error('PAGE ERROR',error.message));
  await page.route('http://fixture.invalid/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:'<div></div>'});
    const project=path.includes('/projects/A/')?'A':'B';
    return route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'field-'+project,project_id:project,name:'Same label',type:'currency',is_archived:false,sort_order:0,options:[]}])});
  });
  await page.goto('http://fixture.invalid/');
  await page.addScriptTag({content:result.outputFiles[0].text});
  const actual=await page.evaluate(()=>fixture.check());
  assert.deepEqual(actual,{before:['field-A'],second:['field-B'],after:[]});
  console.log('Actual API service/MobX store: project metadata stays isolated and invalidates.');
}finally{await browser.close();}
