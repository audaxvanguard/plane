import {build} from 'esbuild';import {chromium} from 'playwright-core';import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT;const {nativeUIBuild}=await import(root+'/deployments/audax/native-ui-test-build.mjs');
const result=await build(nativeUIBuild(root,process.cwd(),'view-columns-fixture.tsx'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage();await page.setContent('<div id="root"/>');await page.addScriptTag({content:result.outputFiles[0].text});
const cells=page.locator('td');assert.equal(await cells.count(),2);assert.equal(await cells.last().getByLabel('Valor',{exact:true}).isDisabled(),true);
await cells.first().getByLabel('Valor',{exact:true}).fill('1.234,56');await cells.first().getByRole('button',{name:'Salvar',exact:true}).click();await cells.first().getByRole('alert').waitFor();assert.equal(await cells.first().getByLabel('Valor',{exact:true}).inputValue(),'1.234,56');console.log('Actual custom spreadsheet cell: archived read-only and failed-save retention passed.');
}finally{await browser.close();}
