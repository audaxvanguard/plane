import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import {initReactI18next,I18nextProvider} from 'react-i18next';
import pt from '../../packages/i18n/src/locales/pt-BR/project-settings.json';
import {ProjectViewForm} from '../../apps/web/core/components/views/form';
import {DisplayFiltersSelection} from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection';
function Fixture(){
 const [project,setProject]=useState('A');
 const [mode,setMode]=useState('form');
 const [admin,setAdmin]=useState(true);
 const [selected,setSelected]=useState({state:true,custom_fields:[]});
 (window as any).fixtureAdmin=admin;
 (window as any).fixtureParams={workspaceSlug:'test',projectId:project,viewId:mode==='view'?'VIEW':undefined,moduleId:mode==='module'?'MODULE':undefined};
 return <><button onClick={()=>setMode('view')}>Saved-view header</button><button onClick={()=>setMode('module')}>Module header</button><button onClick={()=>setProject(project==='A'?'B':'A')}>Switch project</button><button onClick={()=>setAdmin(false)}>Use member role</button>
 {mode==='form'?<ProjectViewForm projectId={project} workspaceSlug="test" preLoadedData={{custom_view:{version:2,columns:[{kind:'custom',field_id:'amount-A',alias:'Receita'}],conditions:[],sort:null,group_by:null,metrics:[],stages:null,count_scopes:['all']}}} handleClose={()=>{}} handleFormSubmit={async values=>{if(!(window as any).saveRetried){(window as any).saveRetried=true;throw new Error('Server unavailable');}document.getElementById('result')!.textContent=JSON.stringify(values)}}/>:
 <DisplayFiltersSelection displayProperties={selected as any} displayFilters={{layout:'list',group_by:'state'} as any} handleDisplayFiltersUpdate={()=>{}} handleDisplayPropertiesUpdate={p=>setSelected(v=>({...v,...p}))} layoutDisplayFiltersOptions={{display_properties:['state'],display_filters:{},extra_options:{access:false}} as any}/>}<output id="result"/><output id="selected-properties">{JSON.stringify(selected)}</output></>;
}
void i18next.use(initReactI18next).init({lng:'pt-BR',resources:{'pt-BR':{translation:pt}}}).then(()=>createRoot(document.getElementById('root')!).render(<I18nextProvider i18n={i18next}><Fixture/></I18nextProvider>));
