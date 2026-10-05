/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
// hooks
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useIssues } from "@/hooks/store/use-issues";
import { useUser } from "@/hooks/store/user";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { useAppRouter } from "@/hooks/use-app-router";
import { ViewConfigurationToolbar } from "@/components/views/configuration/toolbar";
import { useProjectView } from "@/hooks/store/use-project-view";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { IssuePeekOverview } from "../../peek-overview";
import { ProjectViewCalendarLayout } from "../calendar/roots/project-view-root";
import { BaseGanttRoot } from "../gantt";
import { ProjectViewKanBanLayout } from "../kanban/roots/project-view-root";
import { ProjectViewListLayout } from "../list/roots/project-view-root";
import { ProjectViewSpreadsheetLayout } from "../spreadsheet/roots/project-view-root";

function ProjectViewIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined; viewId: string }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ProjectViewListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <ProjectViewKanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <ProjectViewCalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={props.viewId} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ProjectViewSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ProjectViewLayoutRoot = observer(function ProjectViewLayoutRoot() {
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, viewId: routerViewId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug?.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId?.toString() : undefined;
  const viewId = routerViewId ? routerViewId?.toString() : undefined;
  // hooks
  const { issuesFilter, issues } = useIssues(EIssuesStoreType.PROJECT_VIEW);
  const { data: currentUser } = useUser();
  const { resetExpression } = useWorkItemFilters();
  const router = useAppRouter();
  const { getViewById } = useProjectView();
  // derived values
  const projectView = viewId ? getViewById(viewId) : undefined;
  const workItemFilters = viewId ? issuesFilter?.getIssueFilters(viewId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout;
  const initialWorkItemFilters = projectView
    ? {
        displayFilters: workItemFilters?.displayFilters,
        displayProperties: workItemFilters?.displayProperties,
        kanbanFilters: workItemFilters?.kanbanFilters,
        richFilters: workItemFilters?.richFilters ?? projectView.rich_filters,
      }
    : undefined;

  useSWR(
    workspaceSlug && projectId && viewId ? `PROJECT_VIEW_ISSUES_${workspaceSlug}_${projectId}_${viewId}` : null,
    async () => {
      if (workspaceSlug && projectId && viewId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, viewId);
      }
    }
  );

  useEffect(
    () => () => {
      if (workspaceSlug && viewId) {
        issuesFilter?.resetFilters(workspaceSlug, viewId);
      }
    },
    [issuesFilter, workspaceSlug, viewId]
  );

  if (!workspaceSlug || !projectId || !viewId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT_VIEW}>
      <ProjectLevelWorkItemFiltersHOC
        entityId={viewId}
        entityType={EIssuesStoreType.PROJECT_VIEW}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId, viewId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: projectViewWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            <ViewConfigurationToolbar key={`${workspaceSlug}:${projectId}:${viewId}`} context={{ workspaceSlug, projectId, viewId }}
              canSave={projectView?.owned_by === currentUser?.id && !projectView?.is_locked}
              onApplied={() => { void issues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, viewId, "mutation").catch(() => {}); }}
              onDiscard={() => { const filters = issuesFilter.getIssueFilters(viewId); if (filters) resetExpression(EIssuesStoreType.PROJECT_VIEW, viewId, filters.richFilters); }}
              onCopied={(id) => router.push(`/${workspaceSlug}/projects/${projectId}/views/${id}`)} />
            {projectViewWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={projectViewWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.HEADER_SAVE_VIEW_BUTTON,
                }}
              />
            )}
            <div className="relative h-full w-full overflow-auto">
              <ProjectViewIssueLayout activeLayout={activeLayout} viewId={viewId.toString()} />
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
