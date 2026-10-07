// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT;
const { nativeUIBuild } = await import(root + "/deployments/audax/native-ui-test-build.mjs");
const options = nativeUIBuild(root, process.cwd(), "custom-field-activity-fixture.tsx");
const bridge = root + "/deployments/audax/custom-field-activity-test-bridge.tsx";
options.alias["@/hooks/store/use-issue-detail"] = bridge;
options.alias["@/helpers"] = root + "/apps/web/helpers";
options.plugins = [
  {
    name: "history-frame-boundary",
    setup(b) {
      b.onResolve({ filter: /helpers\/activity-block$/ }, (a) =>
        a.importer.endsWith("/actions/custom-field.tsx") ? { path: bridge } : null
      );
    },
  },
];
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
  assert.match(
    await page.getByTestId("history-amount").textContent(),
    /Historical property.*R\$.*0,00.*R\$.*9\.007\.199\.254\.740\.992,01/
  );
  assert.match(await page.getByTestId("history-text").textContent(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.locator("img").count(), 0);
  console.log("Real history renderer: captured names, exact old/new BRL, and escaped text passed.");
} finally {
  await browser.close();
}
