import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT,
  work = process.cwd();
const result = await build({
  stdin: {
    contents: `import {ViewMetricsStore} from '${root}/apps/web/core/store/project/view-metrics.store.ts';export const store=new ViewMetricsStore();`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "fixture",
  nodePaths: [work + "/node_modules"],
  alias: {
    axios: work + "/node_modules/axios/dist/browser/axios.cjs",
    "@plane/constants": root + "/packages/constants/src/endpoints.ts",
  },
  define: { "process.env": "{}", "process.env.NODE_ENV": '"production"' },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  let calls = 0;
  let release;
  await page.route("http://fixture.invalid/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/")
      return route.fulfill({ contentType: "text/html", body: "<div/>" });
    calls++;
    const n = calls;
    if (n === 1) await new Promise((r) => (release = r));
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        metrics: [
          {
            field_id: "amount",
            type: "currency",
            scopes: {
              all: {
                total: n === 1 ? "0.00" : "9007199254740992.01",
                item_count: 100,
                valued_count: 100,
                missing_count: 0,
              },
            },
            groups: [],
          },
        ],
        groups_may_overlap: false,
      }),
    });
  });
  await page.goto("http://fixture.invalid/");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.evaluate(() => {
    window.context = { workspaceSlug: "test", projectId: "A", viewId: "V" };
    window.effective = {
      custom_view: {
        version: 2,
        columns: [],
        conditions: [],
        sort: null,
        group_by: null,
        metrics: [{ field_id: "amount", scopes: ["all"] }],
        stages: null,
        count_scopes: [],
      },
      rich_filters: {},
      display_filters: { group_by: "state" },
    };
    window.first = fixture.store.fetch(window.context, window.effective);
  });
  await page.waitForFunction(() => fixture.store.get(window.context)?.loading);
  await page.evaluate(() => fixture.store.invalidate("A"));
  await page.evaluate(() => fixture.store.fetch(window.context, window.effective));
  release();
  await page.evaluate(() => window.first);
  assert.equal(
    await page.evaluate(() => fixture.store.get(window.context).data.metrics[0].scopes.all.total),
    "9007199254740992.01",
    "old response must not replace fresh exact-decimal totals"
  );
  await page.evaluate(() => fixture.store.reset());
  assert.equal(await page.evaluate(() => fixture.store.get(window.context)), null);
  console.log("Real metrics store/service: exact decimals, invalidation and stale-response discard passed.");
} finally {
  await browser.close();
}
