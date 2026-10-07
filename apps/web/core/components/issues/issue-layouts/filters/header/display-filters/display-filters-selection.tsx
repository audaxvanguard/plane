/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectCustomFieldDefinitions } from "@/hooks/use-project-custom-field-definitions";
import { ViewPropertiesManager } from "@/components/views/configuration/properties-manager";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  ILayoutDisplayFiltersOptions,
  TIssueGroupByOptions,
  TProjectCustomField,
} from "@plane/types";
// components
import {
  FilterDisplayProperties,
  FilterExtraOptions,
  FilterGroupBy,
  FilterOrderBy,
  FilterSubGroupBy,
} from "@/components/issues/issue-layouts/filters";

type Props = {
  displayFilters: IIssueDisplayFilterOptions | undefined;
  displayProperties: IIssueDisplayProperties;
  handleDisplayFiltersUpdate: (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => void;
  handleDisplayPropertiesUpdate: (updatedDisplayProperties: Partial<IIssueDisplayProperties>) => void;
  layoutDisplayFiltersOptions: ILayoutDisplayFiltersOptions | undefined;
  ignoreGroupedFilters?: Partial<TIssueGroupByOptions>[];
  cycleViewDisabled?: boolean;
  moduleViewDisabled?: boolean;
  isEpic?: boolean;
  customFields?: TProjectCustomField[];
  workspaceSlug?: string;
  projectId?: string;
};

export const DisplayFiltersSelection = observer(function DisplayFiltersSelection(props: Props) {
  const {
    displayFilters,
    displayProperties,
    handleDisplayFiltersUpdate,
    handleDisplayPropertiesUpdate,
    layoutDisplayFiltersOptions,
    ignoreGroupedFilters = [],
    cycleViewDisabled = false,
    moduleViewDisabled = false,
    isEpic = false,
  } = props;
  const params = useParams();
  const workspaceSlug = props.workspaceSlug ?? params.workspaceSlug?.toString();
  const projectId = !isEpic ? (props.projectId ?? params.projectId?.toString()) : undefined;
  const metadata = useProjectCustomFieldDefinitions(workspaceSlug, projectId);
  const customFields = props.customFields ?? metadata.fields;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const canManage =
    !!projectId && allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const [manageOpen, setManageOpen] = React.useState(false);
  React.useEffect(() => setManageOpen(false), [projectId, workspaceSlug]);

  const isDisplayFilterEnabled = (displayFilter: keyof IIssueDisplayFilterOptions) =>
    Object.keys(layoutDisplayFiltersOptions?.display_filters ?? {}).includes(displayFilter);

  const computedIgnoreGroupedFilters: Partial<TIssueGroupByOptions>[] = [];
  if (cycleViewDisabled) {
    ignoreGroupedFilters.push("cycle");
  }
  if (moduleViewDisabled) {
    ignoreGroupedFilters.push("module");
  }

  return (
    <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
      {projectId && (
        <div className="space-y-2 py-2">
          {metadata.loading && (
            <p role="status" className="text-11 text-secondary">
              {t("project_settings.custom_fields.loading")}
            </p>
          )}
          {metadata.error && (
            <div role="alert" className="text-11 text-danger-primary">
              {t("project_settings.custom_fields.load_error")}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void metadata.retry();
                }}
              >
                {t("project_settings.custom_fields.retry")}
              </Button>
            </div>
          )}
          {!metadata.loading && !metadata.error && customFields.length === 0 && (
            <p className="text-11 text-secondary">{t("project_settings.custom_fields.empty")}</p>
          )}
          {canManage && (
            <Button variant="secondary" size="sm" onClick={() => setManageOpen(true)}>
              {t("project_settings.custom_fields.manage_properties")}
            </Button>
          )}
          {manageOpen && workspaceSlug && (
            <ViewPropertiesManager
              key={projectId}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              canManage={canManage}
              onClose={() => setManageOpen(false)}
            />
          )}
        </div>
      )}
      {/* display properties */}
      {layoutDisplayFiltersOptions?.display_properties && layoutDisplayFiltersOptions.display_properties.length > 0 && (
        <div className="py-2">
          <FilterDisplayProperties
            customFields={customFields}
            displayProperties={displayProperties}
            displayPropertiesToRender={layoutDisplayFiltersOptions.display_properties}
            handleUpdate={handleDisplayPropertiesUpdate}
            cycleViewDisabled={cycleViewDisabled}
            moduleViewDisabled={moduleViewDisabled}
            isEpic={isEpic}
          />
        </div>
      )}

      {/* group by */}
      {isDisplayFilterEnabled("group_by") && (
        <div className="py-2">
          <FilterGroupBy
            customFields={customFields}
            displayFilters={displayFilters}
            groupByOptions={layoutDisplayFiltersOptions?.display_filters.group_by ?? []}
            handleUpdate={(val) =>
              handleDisplayFiltersUpdate({
                group_by: val,
                ...(val?.startsWith("custom_field:") ? { sub_group_by: null } : {}),
              })
            }
            ignoreGroupedFilters={[...ignoreGroupedFilters, ...computedIgnoreGroupedFilters]}
          />
        </div>
      )}

      {/* sub-group by */}
      {isDisplayFilterEnabled("sub_group_by") &&
        displayFilters?.group_by !== null &&
        !displayFilters?.group_by?.startsWith("custom_field:") &&
        displayFilters?.layout === "kanban" && (
          <div className="py-2">
            <FilterSubGroupBy
              displayFilters={displayFilters}
              handleUpdate={(val) =>
                handleDisplayFiltersUpdate({
                  sub_group_by: val,
                })
              }
              subGroupByOptions={layoutDisplayFiltersOptions?.display_filters.sub_group_by ?? []}
              ignoreGroupedFilters={[...ignoreGroupedFilters, ...computedIgnoreGroupedFilters]}
            />
          </div>
        )}

      {/* order by */}
      {isDisplayFilterEnabled("order_by") && !isEmpty(layoutDisplayFiltersOptions?.display_filters?.order_by) && (
        <div className="py-2">
          <FilterOrderBy
            customFields={customFields}
            selectedOrderBy={displayFilters?.order_by}
            handleUpdate={(val) =>
              handleDisplayFiltersUpdate({
                order_by: val,
              })
            }
            orderByOptions={layoutDisplayFiltersOptions?.display_filters.order_by ?? []}
          />
        </div>
      )}

      {/* Options */}
      {layoutDisplayFiltersOptions?.extra_options.access && (
        <div className="py-2">
          <FilterExtraOptions
            selectedExtraOptions={{
              show_empty_groups: displayFilters?.show_empty_groups ?? true,
              sub_issue: displayFilters?.sub_issue ?? true,
            }}
            handleUpdate={(key, val) =>
              handleDisplayFiltersUpdate({
                [key]: val,
              })
            }
            enabledExtraOptions={layoutDisplayFiltersOptions?.extra_options.values}
          />
        </div>
      )}
    </div>
  );
});
