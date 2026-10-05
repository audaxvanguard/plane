// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { CustomFieldEditor } from "./editor";

export const ItemCustomFields = observer(function ItemCustomFields({ workspaceSlug, projectId, issue, disabled, onUpdate }: {
  workspaceSlug: string; projectId: string; issue: TIssue; disabled: boolean;
  onUpdate: (data: Partial<TIssue>) => Promise<void>;
}) {
  const fields = useCustomFields();
  const { t } = useTranslation();
  const { issue: issueStore } = useIssueDetail();
  const { issues: projectIssues, issuesFilter: projectFilters } = useIssues(EIssuesStoreType.PROJECT);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    void fields.fetchFields(workspaceSlug, projectId).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [fields, workspaceSlug, projectId]);
  const definitions = fields.getFields(projectId).filter((field) => !field.is_archived || issue.custom_values?.[field.id] != null);
  if (!definitions.length && !error) return null;
  return <div className="space-y-4 border-t border-subtle py-4 text-primary">
    <h3 className="text-body-xs-medium text-tertiary">{t("project_settings.custom_fields.label")}</h3>
    {error && <p role="alert" className="text-body-xs-regular text-danger-primary">{t("project_settings.custom_fields.load_error")}</p>}
    {definitions.map((field) => <CustomFieldEditor key={`${issue.id}-${field.id}`} field={field} value={issue.custom_values?.[field.id]} disabled={disabled}
      onSave={async (value) => {
        await onUpdate({ custom_values: { [field.id]: value } });
        // PATCH is sparse; reload the complete map so untouched values remain visible.
        await issueStore.fetchIssue(workspaceSlug, projectId, issue.id);
        const display = projectFilters.getIssueFilters(projectId)?.displayFilters;
        if (display?.order_by?.startsWith("custom_field:") || display?.group_by?.startsWith("custom_field:")) {
          // Keep server-authoritative ordering and complete group counts, including
          // paginated data; never compare BRL amounts via JavaScript Number.
          await projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation").catch(() => setError(true));
        }
      }} />)}
  </div>;
});
