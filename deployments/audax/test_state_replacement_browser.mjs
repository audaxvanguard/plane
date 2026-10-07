import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT;
const { nativeUIBuild } = await import(root + "/deployments/audax/native-ui-test-build.mjs");
const options = nativeUIBuild(root, process.cwd(), "state-replacement-fixture.tsx");
options.define["process.env"] = "{}";
options.alias["axios"] = process.cwd() + "/node_modules/axios/dist/browser/axios.cjs";
options.alias["@/components"] = root + "/apps/web/core/components";
options.alias["@/services"] = root + "/apps/web/core/services";
options.alias["@plane/constants"] = root + "/packages/constants/src/endpoints.ts";
const result = await build(options);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));
  page.on("console", (msg) => console.log("BROWSER", msg.text()));
  let calls = 0;
  await page.route("http://fixture.invalid/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") return route.fulfill({ body: '<div id="root"/>', contentType: "text/html" });
    if (url.pathname.endsWith("replacement-preview/"))
      return route.fulfill({
        body: JSON.stringify({ item_count: 8, referenced_view_ids: ["V"] }),
        contentType: "application/json",
      });
    calls++;
    assert.deepEqual(route.request().postDataJSON(), {
      replacement_state_id: "T",
      expected_item_count: 8,
      confirmed: true,
    });
    return route.fulfill({ status: 409, body: '{"error":"stale"}', contentType: "application/json" });
  });
  await page.goto("http://fixture.invalid/");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.addStyleTag({
    content:
      '[data-slot="dialog-content"]{position:fixed;z-index:100;top:10%;left:15%;width:70%;background:white}[data-slot="dialog-overlay"]{position:fixed;inset:0;z-index:90}[class*="z-[110]"]{z-index:110}',
  });
  const save = page.getByRole("button", { name: "Substituir e remover estado", exact: true });
  await page.getByText("Itens afetados: 8").waitFor();
  assert.equal(await save.isDisabled(), true);
  await page.getByRole("button", { name: "Estado substituto", exact: true }).click();
  await page.getByRole("option", { name: "Target", exact: true }).click();
  await page.getByRole("checkbox").check();
  await save.click();
  await page.getByRole("alert").waitFor();
  assert.equal(calls, 1);
  assert.equal(await page.getByRole("checkbox").isChecked(), true);
  assert.match(await page.getByRole("button", { name: "Estado substituto", exact: true }).textContent(), /Target/);
  assert.equal(await page.evaluate(() => !!window.closed), false);
  console.log(
    "Real state replacement dialog/service: preview, explicit confirmation and failed-save input retention passed."
  );
} finally {
  await browser.close();
}
