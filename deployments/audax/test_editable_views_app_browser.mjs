// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const data = JSON.parse(fs.readFileSync(process.env.CF_APP_FIXTURE, "utf8"));
const base = "http://127.0.0.1:15017";
const project = `${base}/api/workspaces/${data.workspace}/projects/${data.project}`;
const viewUrl = `${project}/views/${data.view}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
const warnings = [];
function monitor(page) {
  page.on("pageerror", (error) => warnings.push(error.message));
}
async function session(cookie) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "session-id", value: cookie, url: base, httpOnly: true }]);
  assert.equal((await context.request.get(`${base}/api/users/me/`)).status(), 200);
  return context;
}
async function saved(context) {
  const response = await context.request.get(viewUrl);
  assert.equal(response.status(), 200);
  return response.json();
}
async function total(page, expectedEnding = "01") {
  await page.waitForFunction(
    ({ id, ending }) =>
      document
        .querySelector(`[data-testid="pipeline-total-${id}-all"]`)
        ?.textContent.includes(`9.007.199.254.740.992,${ending}`),
    { id: data.field, ending: expectedEnding }
  );
}
const saveName = /^(Save view|Salvar visualização)$/;
try {
  const first = await session(data.session);
  const page = await first.newPage();
  monitor(page);
  await page.goto(`${base}/${data.workspace}/projects/${data.project}/views/${data.view}`, {
    waitUntil: "domcontentloaded",
  });
  await total(page);
  await page.getByRole("button", { name: /^(Stages|Etapas)$/ }).click();
  await page.getByRole("button", { name: "Etapa", exact: true }).click();
  await page
    .getByRole("button", { name: /^(Hide stage|Ocultar etapa)$/ })
    .first()
    .click();
  await page.getByTestId("pipeline-hidden-items").waitFor();
  assert.match(await page.getByTestId("pipeline-hidden-items").textContent(), /: 2$/);
  await total(page);
  await page
    .getByRole("button", { name: /^(Restore all stages|Restaurar todas as etapas)$/ })
    .first()
    .click();
  await page.getByRole("button", { name: saveName }).click();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('[role="status"]')).some((e) =>
        /Unsaved|não salvas|não salvos/i.test(e.textContent ?? "")
      )
  );
  assert.equal((await saved(first)).custom_view.stages.field_id, data.stage);
  await page
    .locator("div.bg-layer-3.p-1")
    .filter({ has: page.locator("button") })
    .getByRole("button")
    .nth(3)
    .click();
  await page.getByText("Total BRL", { exact: true }).waitFor();
  assert.ok((await page.getByRole("row").count()) >= 3);
  const cell = page.getByRole("row").filter({ hasText: "Zero" }).getByTestId(`custom-field-${data.field}`);
  await cell.getByRole("textbox").fill("0,10");
  let failCell = true;
  await page.route("**/api/workspaces/**/issues/*/", (route) => {
    if (route.request().method() === "PATCH" && failCell) {
      failCell = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });
  await cell.getByRole("button", { name: /^(Save|Salvar)$/ }).click();
  await cell.getByRole("alert").waitFor();
  assert.equal(await cell.getByRole("textbox").inputValue(), "0,10");
  await cell.getByRole("button", { name: /^(Save|Salvar)$/ }).click();
  await total(page, "11");
  const historyResponse = await first.request.get(`${project}/issues/${data.zero}/history/`);
  assert.equal(historyResponse.status(), 200);
  const history = await historyResponse.json();
  assert.ok(
    history.some((row) => row.field === `custom_field:${data.field}` && JSON.parse(row.new_value).value === "0.10")
  );
  await page.getByRole("button", { name: /^(Columns|Colunas)$/ }).click();
  await page.getByRole("textbox", { name: /Alias — (Receita|Total BRL)/ }).fill("Temporary alias");
  await page
    .getByRole("button", { name: /^(Apply alias|Aplicar alias)$/ })
    .last()
    .click();
  await page.getByText("Temporary alias", { exact: true }).waitFor();
  assert.equal((await saved(first)).custom_view.columns.find((c) => c.field_id === data.field).alias, "Total BRL");
  const second = await session(data.second_session);
  const secondPage = await second.newPage();
  monitor(secondPage);
  await secondPage.goto(`${base}/${data.workspace}/projects/${data.project}/views/${data.view}`, {
    waitUntil: "domcontentloaded",
  });
  await total(secondPage, "11");
  assert.equal(await secondPage.getByText("Temporary alias", { exact: true }).count(), 0);
  assert.ok(await secondPage.getByRole("button", { name: saveName }).isDisabled());
  let failView = true;
  await page.route(`**/views/${data.view}/`, (route) => {
    if (route.request().method() === "PATCH" && failView) {
      failView = false;
      return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: saveName }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /save|salvar/i })
    .waitFor();
  await page.getByText("Temporary alias", { exact: true }).waitFor();
  assert.equal((await saved(first)).custom_view.columns.find((c) => c.field_id === data.field).alias, "Total BRL");
  await page.getByRole("button", { name: saveName }).click();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('[role="status"]')).some((e) =>
        /Unsaved|não salvas|não salvos/i.test(e.textContent ?? "")
      )
  );
  assert.equal(
    (await saved(first)).custom_view.columns.find((c) => c.field_id === data.field).alias,
    "Temporary alias"
  );
  await page.reload();
  await page.getByText("Temporary alias", { exact: true }).waitFor();
  await total(page, "11");
  const preview = await first.request.get(`${project}/states/${data.source}/replacement-preview/`);
  assert.equal(preview.status(), 200);
  assert.equal((await preview.json()).item_count, 1);
  assert.equal(
    (
      await second.request.post(`${project}/states/${data.source}/replace-and-delete/`, {
        data: { replacement_state_id: data.target, expected_item_count: 1, confirmed: true },
      })
    ).status(),
    403
  );
  assert.equal(
    (
      await first.request.post(`${project}/states/${data.source}/replace-and-delete/`, {
        data: { replacement_state_id: data.target, expected_item_count: 0, confirmed: true },
      })
    ).status(),
    400
  );
  assert.equal(
    (
      await first.request.post(`${project}/states/${data.source}/replace-and-delete/`, {
        data: { replacement_state_id: data.target, expected_item_count: 1, confirmed: true },
      })
    ).status(),
    204
  );
  const moved = await first.request.get(`${project}/issues/${data.replacement_item}/`);
  assert.equal(moved.status(), 200);
  assert.equal((await moved.json()).state_id, data.target);
  await page.getByRole("button", { name: /^(Stages|Etapas)$/ }).click();
  await page.getByRole("button", { name: /^(Native states|Estados nativos)$/ }).click();
  await page.getByRole("button", { name: saveName }).click();
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll('[role="status"]')).some((e) =>
        /Unsaved|não salvas|não salvos/i.test(e.textContent ?? "")
      )
  );
  const nativeSaved = await saved(first);
  assert.equal(nativeSaved.custom_view.stages.source, "state");
  const copyResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url() === `${project}/views/`
  );
  await page.getByRole("textbox", { name: /^(New view name|Nome da nova visualização)$/ }).fill("Compiled copy");
  await page.getByRole("button", { name: /^(Save as new view|Salvar como nova visualização)$/ }).click();
  const copiedResponse = await copyResponse;
  assert.equal(copiedResponse.status(), 201);
  const copy = await copiedResponse.json();
  assert.deepEqual(copy.custom_view, nativeSaved.custom_view);
  assert.notEqual(copy.id, data.view);
  await page.waitForURL((url) => url.pathname.includes(copy.id));
  await total(page, "11");
  // Independently reproduced with the unchanged production web image. Keep this
  // explicit allowlist; every other compiled runtime error remains a failure.
  assert.deepEqual(
    warnings.filter((message) => !/^Minified React error #(418|423);/.test(message)),
    []
  );
  console.log(
    `Authenticated compiled acceptance passed: exact totals, hidden-stage access, full spreadsheet, failed cell/view saves and retry, history, two actors, persistence/reload, guarded replacement. Baseline hydration warnings: ${warnings.length}.`
  );
} finally {
  await browser.close();
}
