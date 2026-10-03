import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage();
  await page.setContent('<h1>Bounded browser test</h1>');
  assert.equal(await page.locator('h1').innerText(), 'Bounded browser test');
  console.log('Bounded browser smoke passed.');
} finally { await browser.close(); }
