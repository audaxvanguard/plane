// SPDX-License-Identifier: AGPL-3.0-only
// Run in a scratch directory with playwright-core/esbuild/React/RHF installed.
// Copy time-controls-fixture.tsx and the three actual control/helper files there.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

await build({entryPoints:['time-controls-fixture.tsx'],bundle:true,outfile:'fixture.js',jsx:'automatic',
  alias:{'@/helpers/optional-issue-time':resolve('optional-issue-time.ts')},define:{'process.env.NODE_ENV':'"development"'}});
const server=createServer((req,res)=>{
  res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');
  res.end(req.url==='/fixture.js'?readFileSync('fixture.js'):'<div id="root"></div><script src="/fixture.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const form=page.locator('form');
  const start=form.getByLabel('Start time (optional)',{exact:true});
  const end=form.getByLabel('End time (optional)',{exact:true});
  await start.waitFor();
  await form.getByRole('button',{name:'Create item',exact:true}).click();
  let data=JSON.parse(await page.locator('#submitted').textContent());
  assert.equal(data.start_time,null);assert.equal(data.target_time,null);
  console.log('PASS: date-only creation');

  await start.fill('14:30');await end.fill('15:30');
  await form.getByRole('button',{name:'Create item',exact:true}).click();
  data=JSON.parse(await page.locator('#submitted').textContent());
  assert.equal(data.start_time,'2026-10-01T17:30:00.000Z');
  assert.equal(data.target_time,'2026-10-01T18:30:00.000Z');
  console.log('PASS: creation time inputs commit UTC values directly on main submit');

  await form.getByRole('button',{name:'Reset form',exact:true}).click();
  await start.fill('14:30');await end.fill('13:30');
  await form.getByRole('button',{name:'Create item',exact:true}).click();
  await form.getByRole('alert').first().waitFor();
  assert.equal(await page.locator('#submitted').textContent(),'');
  console.log('PASS: reversed time range blocks creation');

  await form.getByRole('button',{name:'Reset form',exact:true}).click();
  await start.fill('14:30');await form.getByRole('button',{name:'Clear',exact:true}).click();
  await form.getByRole('button',{name:'Create item',exact:true}).click();
  data=JSON.parse(await page.locator('#submitted').textContent());
  assert.equal(data.start_time,null);assert.equal(data.start_date,'2026-10-01');
  console.log('PASS: clear optional time retains date');

  await start.fill('14:30');await form.getByRole('button',{name:'Change start date',exact:true}).click();
  assert.equal(await start.inputValue(),'');
  await form.getByRole('button',{name:'Remove dates',exact:true}).click();
  assert.equal(await form.locator('input[type=time]').count(),0);
  console.log('PASS: changing/removing dates clears stale creation times');

  await form.getByRole('button',{name:'DST scenario',exact:true}).click();
  await start.fill('02:30');await form.getByRole('button',{name:'Create item',exact:true}).click();
  assert.equal(await page.locator('#submitted').textContent(),'');
  assert.match(await form.getByRole('alert').first().textContent(),/does not exist/);
  console.log('PASS: DST gap blocks creation');

  await form.getByRole('button',{name:'Reset form',exact:true}).click();
  await form.getByRole('button',{name:'Equal instants',exact:true}).click();
  await start.fill('14:30');await form.getByRole('button',{name:'Create item',exact:true}).click();
  assert.notEqual(await page.locator('#submitted').textContent(),'');
  console.log('PASS: equal instants with differing ISO precision accepted');

  const quick=page.locator('#quick-start');
  await quick.getByRole('button',{name:'+ Add time (optional)',exact:true}).click();
  await quick.getByLabel('Start time (optional)',{exact:true}).fill('2026-10-01T14:30');
  await quick.getByRole('button',{name:'Save time',exact:true}).click();
  data=JSON.parse(await page.locator('#quick-values').textContent());
  assert.equal(data.start_time,'2026-10-01T17:30:00.000Z');
  console.log('PASS: quick-view add time');

  const quickEnd=page.locator('#quick-end');
  await quickEnd.getByRole('button',{name:'+ Add time (optional)',exact:true}).click();
  await quickEnd.getByLabel('End time (optional)',{exact:true}).fill('2026-10-01T13:30');
  await quickEnd.getByRole('button',{name:'Save time',exact:true}).click();
  assert.match(await quickEnd.getByRole('alert').textContent(),/cannot precede/);
  assert.equal(await quickEnd.locator('input').count(),1);
  console.log('PASS: quick-view validation failures keep editor open');

  await quick.getByRole('button',{name:'Clear Start time',exact:true}).click();
  data=JSON.parse(await page.locator('#quick-values').textContent());
  assert.equal(data.start_time,null);assert.equal(data.start_date,'2026-10-01');
  await page.getByRole('button',{name:'Toggle read-only',exact:true}).click();
  assert.equal(await quick.getByRole('button',{name:'+ Add time (optional)',exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: quick-view clear/read-only; no browser errors');
} finally { await browser.close();server.close(); }
