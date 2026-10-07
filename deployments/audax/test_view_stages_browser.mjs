import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT;
const { nativeUIBuild } = await import(root + "/deployments/audax/native-ui-test-build.mjs");
const options = nativeUIBuild(root, process.cwd(), "view-stages-fixture.tsx");
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
  let writes = 0;
  await page.route("**/*", (route) => {
    writes++;
    return route.abort();
  });
  await page.getByRole("button", { name: "Etapa", exact: true }).click();
  assert.equal(await page.evaluate(() => window.groupBy), "custom_field:stage");
  const alias = page.getByRole("textbox", { name: "Alias B", exact: true });
  await alias.fill("Proposta");
  await alias.blur();
  assert.equal(await page.evaluate(() => window.configuration.stages.aliases.b), "Proposta");
  await page.getByRole("button", { name: "Mover para cima B", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.configuration.stages.order), ["b", "a", "unset"]);
  await page.getByRole("button", { name: "Ocultar etapa", exact: true }).first().click();
  assert.deepEqual(await page.evaluate(() => window.configuration.stages.hidden), ["b"]);
  await page.getByRole("button", { name: "Restaurar todas as etapas", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.configuration.stages.hidden), []);
  assert.equal(writes, 0, "view-local changes must not PATCH shared definitions");
  console.log("Real stage UI: source, aliases, order, hiding and restore without implicit persistence passed.");
} finally {
  await browser.close();
}
