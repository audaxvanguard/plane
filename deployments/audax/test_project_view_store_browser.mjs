import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT,
  work = process.cwd();
const result = await build({
  stdin: {
    contents: `import {ViewConfigurationStore} from '${root}/apps/web/core/store/project/view-configuration.store.ts';export const actorA=new ViewConfigurationStore(),actorB=new ViewConfigurationStore();export function saved(){return {id:'V',project:'P',name:'Pipeline',access:1,owned_by:'owner',is_locked:false,display_filters:{layout:'list',group_by:'state'},display_properties:{},rich_filters:null,custom_view:{version:2,columns:[{kind:'custom',field_id:'amount',alias:'Receita'}],conditions:[{field_id:'amount',operator:'gte',value:'0.10'}],group_by:null,sort:null,metrics:[{field_id:'amount',scopes:['all']}],stages:{source:'state',order:['won'],hidden:['lost'],aliases:{won:'Ganho'}},count_scopes:['all']}};}`,
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
    "@/services": root + "/apps/web/core/services",
    "@/helpers": root + "/apps/web/helpers",
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
  const calls = [];
  let fail = true;
  await page.route("http://fixture.invalid/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/")
      return route.fulfill({ contentType: "text/html", body: "<div/>" });
    const body = route.request().postDataJSON();
    calls.push({ method: route.request().method(), body });
    if (fail) {
      fail = false;
      return route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"view is locked"}' });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        name: "Pipeline",
        access: 1,
        is_locked: false,
        ...body,
        id: route.request().method() === "POST" ? "COPY" : "V",
        project: "P",
        owned_by: "owner",
      }),
    });
  });
  await page.goto("http://fixture.invalid/");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const context = { workspaceSlug: "test", projectId: "P", viewId: "V" };
  const change = await page.evaluate((c) => {
    fixture.actorA.hydrate(c, fixture.saved());
    fixture.actorB.hydrate(c, fixture.saved());
    const working = fixture.actorA.get(c).working;
    working.custom_view.columns[0].alias = "Local";
    fixture.actorA.change(c, { custom_view: working.custom_view });
    return { dirty: fixture.actorA.get(c).dirty, other: fixture.actorB.get(c).working.custom_view.columns[0].alias };
  }, context);
  assert.deepEqual(change, { dirty: true, other: "Receita" });
  assert.equal(calls.length, 0);
  const failed = await page.evaluate(async (c) => {
    try {
      await fixture.actorA.save(c);
    } catch {}
    return fixture.actorA.get(c);
  }, context);
  assert.equal(failed.dirty, true);
  assert.equal(failed.working.custom_view.columns[0].alias, "Local");
  await page.evaluate((c) => fixture.actorA.hydrate(c, fixture.saved()), context);
  assert.equal(
    await page.evaluate((c) => fixture.actorA.get(c).working.custom_view.columns[0].alias, context),
    "Local",
    "late hydration must not overwrite dirty edits"
  );
  await page.evaluate((c) => fixture.actorA.save(c), context);
  assert.equal(calls[1].body.custom_view.version, 2);
  assert.equal(calls[1].body.custom_view.columns[0].alias, "Local");
  assert.deepEqual(calls[1].body.custom_view.conditions, [{ field_id: "amount", operator: "gte", value: "0.10" }]);
  await page.evaluate((c) => fixture.actorB.hydrate(c, fixture.actorA.get(c).saved), context);
  assert.equal(
    await page.evaluate((c) => fixture.actorB.get(c).working.custom_view.columns[0].alias, context),
    "Local"
  );
  await page.evaluate((c) => fixture.actorA.saveAs(c, "Copy"), context);
  assert.equal(calls[2].method, "POST");
  assert.equal(calls[2].body.access, 1, "native create access remains public");
  assert.equal(calls[2].body.name, "Copy");
  assert.deepEqual(calls[2].body.custom_view, calls[1].body.custom_view);
  const privateBlocked = await page.evaluate(async (c) => {
    fixture.actorA.hydrate(c, { ...fixture.actorA.get(c).saved, access: 0 });
    try {
      await fixture.actorA.saveAs(c, "Must not publish");
      return false;
    } catch {
      return true;
    }
  }, context);
  assert.equal(privateBlocked, true);
  assert.equal(calls.length, 3, "copying a private source must not publish settings");
  await page.evaluate((c) => {
    fixture.actorA.change(c, { display_properties: { state: true } });
    fixture.actorA.discard(c);
  }, context);
  assert.equal(await page.evaluate((c) => fixture.actorA.get(c).dirty, context), false);
  await page.evaluate((c) => {
    fixture.actorA.hydrate(
      { ...c, projectId: "OTHER", viewId: "W" },
      { ...fixture.saved(), id: "W", project: "OTHER" }
    );
    fixture.actorA.reset();
  }, context);
  assert.equal(await page.evaluate((c) => fixture.actorA.get(c), context), null);
  console.log(
    "Real configuration store/service: explicit save, failed-save retention, actor isolation, late hydration, native-access duplication and discard passed."
  );
} finally {
  await browser.close();
}
