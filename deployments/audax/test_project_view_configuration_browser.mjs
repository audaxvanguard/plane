import { build } from "esbuild";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const root = process.env.SOURCE_ROOT;
const { viewPropertiesBuild } = await import(root + "/deployments/audax/view-properties-test-build.mjs");
const result = await build(await viewPropertiesBuild(root, process.cwd(), "project-view-configuration-fixture.tsx"));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const writes = [];
  let fail = true;
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  await page.route("http://fixture.invalid/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    if (route.request().method() === "GET")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "amount-A",
            project_id: "A",
            name: "Amount A",
            type: "currency",
            description: "",
            is_archived: false,
            sort_order: 0,
            options: [],
          },
        ]),
      });
    const body = route.request().postDataJSON();
    writes.push(body);
    if (fail) {
      fail = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        id: "V",
        project: "A",
        name: "Pipeline",
        access: 1,
        owned_by: "owner",
        is_locked: false,
      }),
    });
  });
  await page.goto("http://fixture.invalid/");
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByRole("button", { name: "Filtros de propriedades personalizadas", exact: true }).click();
  await page.getByRole("button", { name: "Propriedade para filtrar", exact: true }).click();
  await page.getByRole("option", { name: "Amount A", exact: true }).click();
  await page.getByRole("button", { name: "Comparação", exact: true }).click();
  assert.equal(
    await page.getByRole("option", { name: "Contém", exact: true }).count(),
    0,
    "numeric properties do not expose text operators"
  );
  await page.getByRole("option", { name: "Maior ou igual a", exact: true }).click();
  await page.getByLabel("Amount A", { exact: true }).fill("1.234,56");
  await page.getByRole("button", { name: "Adicionar condição", exact: true }).click();
  await page.locator('[role="status"]').waitFor();
  assert.equal(writes.length, 0, "condition edits remain temporary");
  assert.deepEqual(
    await page.evaluate(() => window.configStore.get(window.configContext).working.custom_view.conditions),
    [{ field_id: "amount-A", operator: "gte", value: "1234.56" }]
  );
  await page.getByRole("button", { name: "Salvar visualização", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator('[role="status"]').count(), 1, "save failure retains edits");
  await page.getByRole("button", { name: "Salvar visualização", exact: true }).click();
  await page.waitForFunction(() => !window.configStore.get(window.configContext).dirty);
  assert.equal(writes[1].custom_view.conditions[0].value, "1234.56");
  await page.getByRole("button", { name: "Remover condição", exact: true }).click();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.configStore.get(window.configContext).working.custom_view.conditions.length),
    1,
    "discard restores persisted conditions"
  );
  await page.getByRole("button", { name: "Colunas", exact: true }).click();
  await page.getByRole("button", { name: "+ Amount A", exact: true }).click();
  await page.getByLabel("Alias — Amount A", { exact: true }).fill("Receita");
  await page.getByRole("button", { name: "Aplicar alias", exact: true }).last().click();
  assert.equal(
    await page.evaluate(
      () =>
        window.configStore.get(window.configContext).working.custom_view.columns.find((c) => c.field_id === "amount-A")
          .alias
    ),
    "Receita"
  );
  assert.equal(writes.length, 2, "column customization is view-local until explicit Save");
  await page.getByRole("button", { name: "Totais", exact: true }).click();
  await page.getByRole("button", { name: "Amount A — Todos", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => window.configStore.get(window.configContext).working.custom_view.metrics),
    [{ field_id: "amount-A", scopes: ["all"] }]
  );
  const countBeforeDrag = writes.length;
  await page.getByTestId("view-column-custom:amount-A").dragTo(page.getByTestId("view-column-builtin:name"));
  assert.equal(
    await page.evaluate(() => window.configStore.get(window.configContext).working.custom_view.columns[0].field_id),
    "amount-A"
  );
  assert.equal(writes.length, countBeforeDrag);
  console.log(
    "Real toolbar/typed conditions: AND decimal comparisons, no implicit writes, explicit save/error retention and discard passed."
  );
} finally {
  await browser.close();
}
