/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// constants
import { SPREADSHEET_SELECT_GROUP } from "@plane/constants";
// ui
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
// components
import { cn } from "@plane/utils";
import { MultipleSelectGroupAction } from "@/components/core/multiple-select";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { SpreadsheetHeaderColumn } from "./spreadsheet-header-column";

interface Props {
  resolvedColumns?: import("@/helpers/project-view-config").TResolvedViewColumn[];
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  canEditProperties: (projectId: string | undefined) => boolean;
  isEstimateEnabled: boolean;
  spreadsheetColumnsList: (keyof IIssueDisplayProperties)[];
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
}

export const SpreadsheetHeader = observer(function SpreadsheetHeader(props: Props) {
  const {
    resolvedColumns,
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    canEditProperties,
    isEstimateEnabled,
    spreadsheetColumnsList,
    selectionHelpers,
    isEpic = false,
  } = props;
  // router
  const { projectId } = useParams();
  // derived values
  const isGroupSelectionEmpty = selectionHelpers.isGroupSelected(SPREADSHEET_SELECT_GROUP) === "empty";
  // auth
  const canSelectIssues = canEditProperties(projectId?.toString()) && !selectionHelpers.isSelectionDisabled;

  return (
    <thead className="sticky top-0 left-0 z-[12] border-b-[0.5px] border-subtle">
      <tr>
        {/* Single header column containing both identifier and workitem */}
        <th
          className="group/list-header left-0 z-[15] h-11 min-w-60 border-r-[0.5px] border-subtle bg-layer-1 text-13 font-medium md:sticky"
          tabIndex={-1}
        >
          <div className="flex h-full w-full items-center gap-2 px-page-x">
            {/* Workitem header section */}
            <div className="flex h-full min-w-80 flex-grow items-center gap-1 py-2.5">
              {canSelectIssues && (
                <div className="mr-1 flex w-3.5 flex-shrink-0 items-center">
                  <MultipleSelectGroupAction
                    className={cn(
                      "pointer-events-none size-3.5 opacity-0 !outline-none group-hover/list-header:pointer-events-auto group-hover/list-header:opacity-100",
                      {
                        "pointer-events-auto opacity-100": !isGroupSelectionEmpty,
                      }
                    )}
                    groupID={SPREADSHEET_SELECT_GROUP}
                    selectionHelpers={selectionHelpers}
                  />
                </div>
              )}
              <span className="text-13 font-medium">{resolvedColumns && resolvedColumns[0]?.title !== "name" ? resolvedColumns?.[0]?.title : `${isEpic ? "Epics" : "Work items"}`} </span>
            </div>
          </div>
        </th>

        {resolvedColumns ? resolvedColumns.filter((c) => c.reference !== "name" && c.reference !== "identifier").map((column) => (
          column.kind === "custom" ? <th key={column.key} className="h-11 min-w-36 border-r border-subtle bg-layer-1 px-3 text-left text-13">{column.title}</th> :
          <SpreadsheetHeaderColumn key={column.key} title={column.title === column.reference ? undefined : column.title}
            property={({assignees:"assignee",target_date:"due_date",created_at:"created_on",updated_at:"updated_on"} as Record<string,keyof IIssueDisplayProperties>)[column.reference] ?? column.reference as keyof IIssueDisplayProperties}
            displayProperties={{...displayProperties, [({assignees:"assignee",target_date:"due_date",created_at:"created_on",updated_at:"updated_on"} as Record<string,string>)[column.reference] ?? column.reference]:true}}
            displayFilters={displayFilters} handleDisplayFilterUpdate={handleDisplayFilterUpdate} isEstimateEnabled={isEstimateEnabled} isEpic={isEpic} />
        )) : spreadsheetColumnsList.map((property) => (
          <SpreadsheetHeaderColumn
            key={property}
            property={property}
            displayProperties={displayProperties}
            displayFilters={displayFilters}
            handleDisplayFilterUpdate={handleDisplayFilterUpdate}
            isEstimateEnabled={isEstimateEnabled}
            isEpic={isEpic}
          />
        ))}
      </tr>
    </thead>
  );
});
