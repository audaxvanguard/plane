import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT;
const { nativeUIBuild } = await import(root + "/deployments/audax/native-ui-test-build.mjs");
const options = nativeUIBuild(root, process.cwd(), "view-metrics-fixture.tsx");
options.alias["@/helpers"] = root + "/apps/web/helpers";
const result = await build(options);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setContent('<div id="root"/>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  assert.match(await page.getByTestId("pipeline-total-amount-all").textContent(), /9\.007\.199\.254\.740\.992,01/);
  assert.match(await page.getByTestId("pipeline-total-amount-open").textContent(), /-R\$.*0,10/);
  assert.match(await page.getByTestId("pipeline-total-amount-filtered").textContent(), /R\$.*0,00/);
  assert.match(await page.getByTestId("pipeline-count-all").textContent(), /100/);
  assert.equal(await page.getByRole("alert").count(), 1);
  console.log("Real metrics UI: exact large/negative/zero totals, counts and overlap warning passed.");
} finally {
  await browser.close();
}
