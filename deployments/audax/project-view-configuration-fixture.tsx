import React from "react";
import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import pt from "../../packages/i18n/src/locales/pt-BR/project-settings.json";
import { ViewConfigurationToolbar } from "../../apps/web/core/components/views/configuration/toolbar";
import { configurationStore } from "./view-properties-test-bridge";
const context = { workspaceSlug: "test", projectId: "A", viewId: "V" };
configurationStore.hydrate(context, {
  id: "V",
  project: "A",
  name: "Pipeline",
  access: 1,
  owned_by: "owner",
  is_locked: false,
  display_filters: { layout: "list", group_by: "state" },
  display_properties: {},
  rich_filters: null,
  custom_view: {
    version: 2,
    columns: [],
    conditions: [],
    group_by: null,
    sort: null,
    metrics: [],
    stages: null,
    count_scopes: [],
  },
} as any);
(window as any).configStore = configurationStore;
(window as any).configContext = context;
void i18next
  .use(initReactI18next)
  .init({ lng: "pt-BR", resources: { "pt-BR": { translation: pt } } })
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <I18nextProvider i18n={i18next}>
        <ViewConfigurationToolbar
          context={context}
          canSave
          onApplied={() => {}}
          onDiscard={() => {}}
          onCopied={(id) => {
            document.getElementById("copy")!.textContent = id;
          }}
        />
        <output id="copy" />
      </I18nextProvider>
    )
  );
