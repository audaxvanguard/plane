import React from 'react';
import { createRoot } from 'react-dom/client';
import { CustomFieldSettings } from '../../apps/web/core/components/project/settings/custom-fields/root';
createRoot(document.getElementById('root')!).render(<CustomFieldSettings fields={[]} onCreate={async data=>{document.getElementById('result')!.textContent=JSON.stringify(data);}} onUpdate={async()=>{}} onCreateOption={async()=>{}} onUpdateOption={async()=>{}}/>);
