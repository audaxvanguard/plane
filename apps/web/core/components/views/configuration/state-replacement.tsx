// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Dialog } from "@plane/propel/dialog";
import { CustomFieldChoice } from "@/components/issues/custom-fields/choice";
import { ProjectStateService } from "@/services/project/project-state.service";
import type { ViewContext } from "@/helpers/project-view-config";
const service = new ProjectStateService();
export type StateReplacementPreview = { item_count: number; referenced_view_ids: string[] };
export function StateReplacement({
  context,
  sourceId,
  states,
  onClose,
  onReplaced,
}: {
  context: Pick<ViewContext, "workspaceSlug" | "projectId">;
  sourceId: string;
  states: { id: string; name: string; default?: boolean; is_triage?: boolean }[];
  onClose: () => void;
  onReplaced: () => Promise<void>;
}) {
  const { t } = useTranslation(),
    key = "project_settings.custom_fields.";
  const [preview, setPreview] = useState<StateReplacementPreview | null>(null),
    [target, setTarget] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(false),
    [saving, setSaving] = useState(false);
  const fetch = () => {
    setError(false);
    setPreview(null);
    setConfirmed(false);
    void service
      .previewReplacement(context.workspaceSlug, context.projectId, sourceId)
      .then(setPreview)
      .catch(() => setError(true));
  };
  useEffect(fetch, [context.workspaceSlug, context.projectId, sourceId]);
  const save = async () => {
    if (!preview || !target || !confirmed) return;
    setSaving(true);
    setError(false);
    try {
      await service.replaceAndDelete(context.workspaceSlug, context.projectId, sourceId, {
        replacement_state_id: target,
        expected_item_count: preview.item_count,
        confirmed: true,
      });
      await onReplaced();
      onClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Panel className="space-y-4 p-5">
        <Dialog.Title>{t(key + "replace_state")}</Dialog.Title>
        <p>{t(key + "replace_state_notice")}</p>
        {error && (
          <div role="alert">
            <p>{t(key + "replacement_error")}</p>
            {preview && (
              <Button variant="secondary" size="sm" onClick={fetch}>
                {t(key + "retry")}
              </Button>
            )}
          </div>
        )}
        {!preview ? (
          <Button size="sm" variant="secondary" onClick={fetch}>
            {t(key + "retry")}
          </Button>
        ) : (
          <>
            <p>
              {t(key + "affected_items")}: {preview.item_count}
            </p>
            <p>
              {t(key + "reference_warning")}: {preview.referenced_view_ids.length}
            </p>
            <CustomFieldChoice
              id="replacement-state"
              label={t(key + "replacement_state")}
              value={target ?? ""}
              choices={states
                .filter((s) => s.id !== sourceId && !s.is_triage)
                .map((s) => ({ value: s.id, label: s.name }))}
              onChange={(value) => setTarget(value as string | null)}
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              {t(key + "confirm_replacement")}
            </label>
          </>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            {t(key + "cancel")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!preview || !target || !confirmed}
            onClick={() => void save()}
          >
            {t(key + "replace_state")}
          </Button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
