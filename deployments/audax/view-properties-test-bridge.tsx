// Test-only boundaries: real form/display UI and metadata store are not mocked.
import React from 'react';
import { CustomFieldStore } from '../../apps/web/core/store/project/custom-field.store';
export const fieldsStore = new CustomFieldStore();
export function useCustomFields() { return fieldsStore; }
export function useParams() { return (window as any).fixtureParams ?? {}; }
export function useProject() { return {getProjectById:()=>({cycle_view:true,module_view:true})}; }
export function usePlatformOS() { return {isMobile:false}; }
export function useUserPermissions() { return {workspaceUserInfo:{},allowPermissions:()=>((window as any).fixtureAdmin ?? true)}; }
export const useGroupByOptions=()=>[];
export function ProjectLevelWorkItemFiltersHOC({children}:any) { return children({filter:null}); }
export function WorkItemFiltersRow() { return null; }
export function LayoutDropDown() { return null; }
export function EmojiPicker({label}:any) { return label; }
export const Logo=()=>null;
export const EmojiIconPickerTypes={EMOJI:'emoji',ICON:'icon'};
export function Input(props:any) { return <input {...props}/>; }
export function TextArea(props:any) { return <textarea {...props}/>; }
export function getComputedDisplayFilters() { return {layout:'list',group_by:'state',order_by:'-created_at'}; }
export function getComputedDisplayProperties() { return {state:true,custom_fields:[]}; }
export function getTabIndex() { return {getIndex:()=>0}; }
export function FiltersDropdown({children,title}:any) { return <section aria-label={title}>{children}</section>; }
export { FilterDisplayProperties } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties';
export { FilterGroupBy } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/group-by';
export { FilterOrderBy } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/order-by';
export { FilterSubGroupBy } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/sub-group-by';
export { FilterExtraOptions } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/extra-options';
export { FilterHeader } from '../../apps/web/core/components/issues/issue-layouts/filters/header/helpers/filter-header';
export { FilterOption } from '../../apps/web/core/components/issues/issue-layouts/filters/header/helpers/filter-option';
export { DisplayFiltersSelection } from '../../apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection';
