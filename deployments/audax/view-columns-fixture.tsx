import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import pt from "../../packages/i18n/src/locales/pt-BR/project-settings.json";
import { CustomFieldColumn } from "../../apps/web/core/components/issues/issue-layouts/spreadsheet/columns/custom-field-column";
const field = {
  id: "amount",
  project_id: "A",
  name: "Valor",
  type: "currency",
  description: "",
  is_archived: false,
  sort_order: 0,
  options: [],
} as const;
function Fixture() {
  const [value, setValue] = useState("0.00");
  return (
    <table>
      <tbody>
        <tr>
          <CustomFieldColumn
            field={field as any}
            value={value}
            onSave={async (v) => {
              if (v === "1234.56") throw new Error("Offline");
              setValue(v as string);
            }}
            disabled={false}
          />
          <CustomFieldColumn
            field={{ ...field, is_archived: true } as any}
            value="0.00"
            disabled={false}
            onSave={async () => {
              throw new Error("No write");
            }}
          />
        </tr>
      </tbody>
    </table>
  );
}
void i18next
  .use(initReactI18next)
  .init({ lng: "pt-BR", resources: { "pt-BR": { translation: pt } } })
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <I18nextProvider i18n={i18next}>
        <Fixture />
      </I18nextProvider>
    )
  );
