import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const root=process.env.SOURCE_ROOT, work=process.cwd();
const {nativeUIBuild}=await import(root+'/deployments/audax/native-ui-test-build.mjs');
const options=nativeUIBuild(root,work,'view-properties-fixture.tsx');
const bridge=root+'/deployments/audax/view-properties-test-bridge.tsx';
Object.assign(options.alias,{
 '@plane/constants':root+'/deployments/audax/view-properties-test-constants.ts',
 '@plane/types':root+'/packages/types/src/index.ts',
 '@plane/utils':bridge,'@plane/ui':bridge,
 '@plane/propel/emoji-icon-picker':bridge,
 'next/navigation':bridge,
 '@/hooks/use-custom-fields':bridge,
 '@/hooks/store/use-project':bridge,
 '@/hooks/store/user':bridge,
 '@/hooks/use-platform-os':bridge,
 '@/components/issues/issue-layouts/filters':bridge,
 '@/components/dropdowns/layout':bridge,
 '@/components/work-item-filters/filters-hoc/project-level':bridge,
 '@/components/work-item-filters/filters-row':bridge,
 axios:work+'/node_modules/axios/dist/browser/axios.cjs',
 '@/helpers':root+'/apps/web/helpers',
 '@':root+'/apps/web/core',
});
options.define['process.env']='{}';
options.plugins=[{name:'stock-boundaries',setup(b){b.onResolve({filter:/.*/},a=>{
 if(a.importer.endsWith('/views/form.tsx') && /work-item-filters\/|dropdowns\/layout/.test(a.path)) return {path:bridge};
 if(a.importer.endsWith('/group-by.tsx') && a.path==='../../../utils') return {path:bridge};
 if(a.importer.endsWith('/use-project-custom-field-definitions.ts') && a.path==='./use-custom-fields') return {path:bridge};
 return null;
});}}];
const result=await build(options);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const requests=[];let failA=true;
 page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
 await page.route('http://fixture.invalid/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
  requests.push({path,method:route.request().method()});
  if(path.includes('/projects/A/')&&failA){failA=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'});}
  const project=path.includes('/projects/A/')?'A':'B';
  return route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'amount-'+project,project_id:project,name:'Amount '+project,type:'currency',description:'',is_archived:false,sort_order:0,options:[]}])});
 });
 await page.goto('http://fixture.invalid/');
 // Minimal test-only portal positioning, equivalent to the production Tailwind rules.
 await page.addStyleTag({content:'[data-slot="dialog-content"]{position:fixed;z-index:100;top:10%;left:15%;width:70%;max-height:80vh;overflow:auto;background:white}[data-slot="dialog-overlay"]{position:fixed;inset:0;z-index:90}'});
 await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click({timeout:2500});
 await page.getByRole('button',{name:'Amount A',exact:true}).waitFor();
 assert.equal(requests.filter(r=>r.path.includes('/projects/A/custom-fields/')).length,2);
 await page.getByRole('button',{name:'Amount A',exact:true}).click();
 await page.locator('#name').fill('CRM');
 await page.getByRole('button',{name:'view.create.label',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('result').textContent.includes('CRM'));
 assert.deepEqual(JSON.parse(await page.locator('#result').textContent()).display_properties.custom_fields,['amount-A'],'actual form submits property selection');
 assert.equal(requests.some(r=>r.method!=='GET'),false,'property selection must not silently save a shared view');
 await page.getByRole('button',{name:'Saved-view header',exact:true}).click();
 await page.getByRole('button',{name:'Amount A',exact:true}).waitFor();
 assert.equal(requests.filter(r=>r.path.includes('/projects/A/custom-fields/')).length,2,'header reuses project metadata');
 await page.getByRole('button',{name:'Gerenciar propriedades',exact:true}).click();
 await page.getByRole('heading',{name:'Campos personalizados',exact:true}).waitFor();
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Use member role',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Gerenciar propriedades',exact:true}).count(),0);
 await page.getByRole('button',{name:'Amount A',exact:true}).click();
 assert.deepEqual(JSON.parse(await page.locator('#selected-properties').textContent()).custom_fields,['amount-A'],'member can toggle view properties');
 await page.getByRole('button',{name:'Module header',exact:true}).click();
 await page.getByRole('button',{name:'Switch project',exact:true}).click();
 await page.getByRole('button',{name:'Amount B',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Amount A',exact:true}).count(),0);
 assert.equal(requests.filter(r=>r.path.includes('/projects/B/custom-fields/')).length,1);
 assert.equal(requests.some(r=>r.path.includes('/projects/VIEW/')||r.path.includes('/projects/MODULE/')),false);
 console.log('Real view form/display: metadata retry, actual project scope, caching and admin property management passed.');
}finally{await browser.close();}
