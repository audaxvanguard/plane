import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT || '/source',work=process.cwd();
const {nativeUIBuild}=await import(root+'/deployments/audax/native-ui-test-build.mjs');
const result=await build(nativeUIBuild(root,work,'custom-fields-settings-fixture.tsx'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();
  await page.setContent('<div id="root"></div><output id="result"></output>');
  await page.addScriptTag({content:result.outputFiles[0].text});
  await page.getByLabel('Field name',{exact:true}).fill('Opportunity value');
  await page.getByRole('button',{name:'Field type',exact:true}).click();
  await page.getByRole('option',{name:'Currency (BRL)',exact:true}).click();
  await page.getByRole('button',{name:'Create field',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent!=='');
  assert.deepEqual(JSON.parse(await page.locator('#result').textContent()),{name:'Opportunity value',type:'currency'});
  console.log('Actual field settings: admins can configure an optional BRL field.');
}finally{await browser.close();}
