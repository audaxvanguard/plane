// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import type { TIssue } from "@plane/types";
import { useCustomFields } from "@/hooks/use-custom-fields";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { CustomFieldEditor } from "./editor";

export const ItemCustomFields = observer(function ItemCustomFields({ workspaceSlug, projectId, issue, disabled, onUpdate }: {
  workspaceSlug: string; projectId: string; issue: TIssue; disabled: boolean;
  onUpdate: (data: Partial<TIssue>) => Promise<void>;
}) {
  const fields = useCustomFields();
  const { issue: issueStore } = useIssueDetail();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fields.fetchFields(workspaceSlug, projectId).catch(() => { if (active) setError("Could not load custom fields."); });
    return () => { active = false; };
  }, [fields, workspaceSlug, projectId]);
  const definitions = fields.getFields(projectId).filter((field) => !field.is_archived || issue.custom_values?.[field.id] != null);
  if (!definitions.length && !error) return null;
  return <div className="space-y-4 py-4">
    <h3 className="text-sm font-medium">Custom fields</h3>
    {error && <p role="alert">{error}</p>}
    {definitions.map((field) => <CustomFieldEditor key={`${issue.id}-${field.id}`} field={field} value={issue.custom_values?.[field.id]} disabled={disabled}
      onSave={async (value) => {
        await onUpdate({ custom_values: { [field.id]: value } });
        // PATCH is sparse; reload the complete map so untouched values remain visible.
        await issueStore.fetchIssue(workspaceSlug, projectId, issue.id);
      }} />)}
  </div>;
});
