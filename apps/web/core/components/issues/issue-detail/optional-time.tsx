// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { localScheduleToUtc, utcScheduleToLocal } from "@/helpers/optional-issue-time";

export function OptionalIssueTime(props: {
  label: string;
  date: string | null;
  value: string | null | undefined;
  timeZone: string;
  disabled: boolean;
  onSave: (instant: string | null, localDate?: string) => Promise<void>;
}) {
  const { label, date, value, timeZone, disabled, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const localValue = utcScheduleToLocal(value, timeZone);
  useEffect(() => {
    setDraft(localValue);
    setEditing(false);
    setError("");
  }, [localValue, date, timeZone]);

  if (!date) return null;
  const save = async (clear = false) => {
    setError("");
    setSaving(true);
    try {
      const instant = clear || !draft ? null : localScheduleToUtc(draft, timeZone);
      await onSave(instant, instant ? draft.slice(0, 10) : undefined);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save time.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-2 text-body-xs-regular">
      {editing ? (
        <div className="space-y-1">
          <input
            type="datetime-local"
            aria-label={`${label} (optional)`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={disabled || saving}
            className="w-full rounded-sm border border-subtle-1 bg-transparent px-1 py-1"
          />
          <div className="flex gap-3">
            <button type="button" disabled={disabled || saving} onClick={() => void save()}>Save time</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => {
              setDraft(localValue || `${date}T09:00`);
              setEditing(true);
            }}
            className="text-placeholder hover:text-primary"
          >
            {localValue ? `${localValue.replace("T", " ")} · Edit time` : "+ Add time (optional)"}
          </button>
          {value && !disabled && (
            <button type="button" disabled={saving} aria-label={`Clear ${label}`} onClick={() => void save(true)}>
              Clear
            </button>
          )}
        </div>
      )}
      {(editing || value) && <div className="mt-1 text-placeholder">{timeZone}</div>}
      {error && <div role="alert" className="mt-1 text-danger-primary">{error}</div>}
    </div>
  );
}
