import React from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import en from '../../packages/i18n/src/locales/en/project-settings.json';
import { CustomFieldEditor } from '../../apps/web/core/components/issues/custom-fields/editor';
const fields=[
  {id:'currency',project_id:'p',name:'Opportunity value',type:'currency',description:'',is_archived:false,options:[],sort_order:0},
  {id:'checkbox',project_id:'p',name:'Qualified',type:'checkbox',description:'',is_archived:false,options:[],sort_order:1},
] as const;
void i18next.use(initReactI18next).init({ lng:'en', resources:{en:{translation:en}} }).then(() => {
  createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18next}><div>{fields.map(field=><CustomFieldEditor key={field.id} field={{...field,options:[]}} value={field.type==='currency'?'0.10':null} onSave={async value=>{
    if(field.id==='currency')throw new Error('Save failed, try again');
    document.getElementById('result')!.textContent=JSON.stringify(value);
  }}/>) }<output id='result'/></div></I18nextProvider>);
});
