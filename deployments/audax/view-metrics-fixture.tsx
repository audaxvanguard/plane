import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import pt from "../../packages/i18n/src/locales/pt-BR/project-settings.json";
import { PipelineTotals } from "../../apps/web/core/components/issues/issue-layouts/metrics/totals";
const response = {
  metrics: [
    {
      field_id: "amount",
      type: "currency",
      scopes: {
        all: { total: "9007199254740992.01", item_count: 100, valued_count: 99, missing_count: 1 },
        open: { total: "-0.10", item_count: 5, valued_count: 5, missing_count: 0 },
        filtered: { total: "0.00", item_count: 0, valued_count: 0, missing_count: 0 },
      },
      groups: [
        {
          key: "won",
          label: "Won",
          scopes: { all: { total: "0.00", item_count: 0, valued_count: 0, missing_count: 0 } },
        },
      ],
    },
  ],
  groups_may_overlap: true,
  counts: { scopes: { all: { item_count: 100 } }, groups: [] },
};
void i18next
  .use(initReactI18next)
  .init({ lng: "pt-BR", resources: { "pt-BR": { translation: pt } } })
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <I18nextProvider i18n={i18next}>
        <PipelineTotals response={response as any} fields={[{ id: "amount", name: "Receita" }] as any} />
      </I18nextProvider>
    )
  );
