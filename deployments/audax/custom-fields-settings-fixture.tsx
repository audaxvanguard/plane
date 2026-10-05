import React from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import en from '../../packages/i18n/src/locales/en/project-settings.json';
import { CustomFieldSettings } from '../../apps/web/core/components/project/settings/custom-fields/root';
void i18next.use(initReactI18next).init({lng:'en',resources:{en:{translation:en}}}).then(() => {
  createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18next}><CustomFieldSettings fields={[]} onCreate={async data=>{document.getElementById('result')!.textContent=JSON.stringify(data);}} onUpdate={async()=>{}} onCreateOption={async()=>{}} onUpdateOption={async()=>{}}/></I18nextProvider>);
});
