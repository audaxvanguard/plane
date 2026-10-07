import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import pt from "../../packages/i18n/src/locales/pt-BR/project-settings.json";
import { StateReplacement } from "../../apps/web/core/components/views/configuration/state-replacement";
void i18next
  .use(initReactI18next)
  .init({ lng: "pt-BR", resources: { "pt-BR": { translation: pt } } })
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <I18nextProvider i18n={i18next}>
        <StateReplacement
          context={{ workspaceSlug: "test", projectId: "P" }}
          sourceId="S"
          states={[
            { id: "S", name: "Source" },
            { id: "T", name: "Target" },
          ]}
          onClose={() => {
            (window as any).closed = true;
          }}
          onReplaced={async () => {
            (window as any).replaced = true;
          }}
        />
      </I18nextProvider>
    )
  );
