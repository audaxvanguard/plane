// Test constants load actual metadata/options and permission enums where applicable.
export * from "../../packages/constants/src/issue/common";
export * from "../../packages/constants/src/endpoints";
export const ETabIndices = { PROJECT_VIEW: "view" };
export const EUserPermissions = { ADMIN: 20 };
export const EUserPermissionsLevel = { PROJECT: "project" };
const layout = { display_properties: ["state"], display_filters: {}, extra_options: { access: false } };
export const ISSUE_DISPLAY_FILTERS_BY_PAGE = {
  issues: { layoutOptions: { list: layout, kanban: layout }, filters: [] },
};
