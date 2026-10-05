import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT || '/source',work=process.cwd();
const result=await build({entryPoints:[root+'/deployments/audax/custom-fields-settings-fixture.tsx'],bundle:true,write:false,format:'iife',jsx:'automatic',alias:{react:work+'/node_modules/react','react-dom':work+'/node_modules/react-dom'}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  await page.setContent('<div id="root"></div><output id="result"></output>');
  await page.addScriptTag({content:result.outputFiles[0].text});
  await page.getByLabel('Field name',{exact:true}).fill('Opportunity value');
  await page.getByLabel('Field type',{exact:true}).selectOption('currency');
  await page.getByRole('button',{name:'Create field',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent!=='');
  assert.deepEqual(JSON.parse(await page.locator('#result').textContent()),{name:'Opportunity value',type:'currency'});
  console.log('Actual field settings: admins can configure an optional BRL field.');
}finally{await browser.close();}
