import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT || '/source';
const work=process.cwd();
const result=await build({entryPoints:[root+'/deployments/audax/custom-fields-editor-fixture.tsx'],bundle:true,write:false,format:'iife',jsx:'automatic',alias:{react:work+'/node_modules/react','react-dom':work+'/node_modules/react-dom'}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:result.outputFiles[0].text});
  const currency=page.locator('[data-testid="custom-field-currency-input"]');
  await currency.fill('9.007.199.254.740.992,01');
  await page.locator('[data-testid="custom-field-currency"] button', {hasText:'Save'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await currency.inputValue(),'9.007.199.254.740.992,01');
  const checkbox=page.locator('[data-testid="custom-field-checkbox-input"]');
  await checkbox.selectOption('false');
  await page.locator('[data-testid="custom-field-checkbox"] button', {hasText:'Save'}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent==='false');
  await checkbox.selectOption('');
  await page.locator('[data-testid="custom-field-checkbox"] button', {hasText:'Save'}).click();
  await page.waitForFunction(()=>document.getElementById('result').textContent==='null');
  console.log('Actual React editors: failed saves preserve input, false differs from unset.');
} finally {await browser.close();}
