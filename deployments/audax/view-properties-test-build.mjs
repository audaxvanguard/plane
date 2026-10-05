export async function viewPropertiesBuild(root,work,fixture) {
const {nativeUIBuild}=await import(root+'/deployments/audax/native-ui-test-build.mjs');
const options=nativeUIBuild(root,work,fixture);
const bridge=root+'/deployments/audax/view-properties-test-bridge.tsx';
Object.assign(options.alias,{
 '@plane/constants':root+'/deployments/audax/view-properties-test-constants.ts',
 '@plane/types':root+'/packages/types/src/index.ts',
 '@plane/utils':bridge,'@plane/ui':bridge,
 '@plane/propel/emoji-icon-picker':bridge,
 'next/navigation':bridge,
 '@/hooks/use-custom-fields':bridge,
 '@/hooks/use-view-configuration':bridge,
 '@/hooks/store/use-project':bridge,
 '@/hooks/store/user':bridge,
 '@/hooks/use-platform-os':bridge,
 '@/components/issues/issue-layouts/filters':bridge,
 '@/components/dropdowns/layout':bridge,
 '@/components/work-item-filters/filters-hoc/project-level':bridge,
 '@/components/work-item-filters/filters-row':bridge,
 axios:work+'/node_modules/axios/dist/browser/axios.cjs',
 '@/helpers':root+'/apps/web/helpers',
 '@':root+'/apps/web/core',
});
options.define['process.env']='{}';
options.plugins=[{name:'stock-boundaries',setup(b){b.onResolve({filter:/.*/},a=>{
 if(a.importer.endsWith('/views/form.tsx') && /work-item-filters\/|dropdowns\/layout/.test(a.path)) return {path:bridge};
 if(a.importer.endsWith('/group-by.tsx') && a.path==='../../../utils') return {path:bridge};
 if(a.importer.endsWith('/use-project-custom-field-definitions.ts') && a.path==='./use-custom-fields') return {path:bridge};
 return null;
});}}];
return options;
}
