import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { nativeCustomView } from '../../apps/web/helpers/custom-fields';
import { FormProvider, useForm } from 'react-hook-form';
import i18next from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import pt from '../../packages/i18n/src/locales/pt-BR/project-settings.json';
import { CustomFieldEditor } from '../../apps/web/core/components/issues/custom-fields/editor';
import * as fieldEditors from '../../apps/web/core/components/issues/custom-fields/editor';
import { FilterDisplayProperties } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties';
import { IssueFormCustomFields } from '../../apps/web/core/components/issues/custom-fields/form';
import { CustomFieldSettings } from '../../apps/web/core/components/project/settings/custom-fields/root';
import type { TProjectCustomField } from '@plane/types';
const field = (id: string, type: TProjectCustomField['type']): TProjectCustomField => ({
  id, type, name: id, description: '', sort_order: 0, is_archived: false,
  project_id: 'project', options: [],
});
const ready = i18next.use(initReactI18next).init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: pt } } });
function Fixture() {
  const [result, setResult] = useState('');
  return <I18nextProvider i18n={i18next}>
    <CustomFieldEditor field={field('currency', 'currency')} onSave={async () => { throw new Error('offline'); }} />
    <CustomFieldEditor field={field('checkbox', 'checkbox')} onSave={async (value) => { setResult(JSON.stringify(value)); }} />
    <output id="result">{result}</output>
    <FormFixture />
    <DisplayFixture />
    <ViewOptionsFixture />
    <CustomFieldSettings fields={[{...field('Stage', 'select')}]} onCreate={async (data) => setResult(JSON.stringify(data))}
      onUpdate={async () => {}} onCreateOption={async () => { throw new Error('offline'); }} onUpdateOption={async () => {}} />
  </I18nextProvider>;
}
function DisplayFixture() {
  const [properties, setProperties] = useState({custom_fields: [] as string[]});
  const Chips = fieldEditors.CustomFieldChips;
  return <section data-testid="display-properties"><FilterDisplayProperties displayProperties={properties} displayPropertiesToRender={[]} customFields={[field('amount', 'currency')]}
    handleUpdate={(next) => setProperties({...properties, ...next})} /><output id="selected-fields">{JSON.stringify(properties.custom_fields)}</output>
    {Chips && <Chips fields={[field('amount', 'currency')]} selected={properties.custom_fields} values={{amount:'1234.56'}} />}
    </section>;
}
function ViewOptionsFixture() {
  const [group, setGroup] = useState<string>();
  const [sort, setSort] = useState<string>();
  const Group = fieldEditors.CustomFieldGroupOptions;
  const Sort = fieldEditors.CustomFieldSortOptions;
  const fields = [field('stage','select'),field('qualified','checkbox'),field('amount','currency')];
  return <section data-testid="view-options">
    <div data-testid="custom-group">{Group && <Group fields={fields} selected={group} onChange={setGroup} />}</div>
    <div data-testid="custom-sort">{Sort && <Sort fields={fields} selected={sort} onChange={setSort} />}</div>
    <output id="custom-config">{JSON.stringify(nativeCustomView(group,sort))}</output>
  </section>;
}
function FormFixture() {
  const methods = useForm({ defaultValues: { custom_values: { amount: null } } });
  return <FormProvider {...methods}><form data-testid="create-form" onSubmit={methods.handleSubmit((values) => { document.getElementById('form-result')!.textContent = JSON.stringify(values); })}>
    <IssueFormCustomFields fields={[field('amount', 'currency')]} />
    <button type="submit">Criar item</button><button type="button" onClick={() => methods.reset({custom_values:{amount:null}})}>Reiniciar formulário</button><output id="form-result" />
  </form></FormProvider>;
}
void ready.then(() => createRoot(document.getElementById('root')!).render(<Fixture />));
