// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useId, useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import type { TIssue } from "@plane/types";
import { localScheduleToUtc, utcScheduleToLocal } from "@/helpers/optional-issue-time";

function OptionalFormTime(props: {
  dateField: "start_date" | "target_date";
  timeField: "start_time" | "target_time";
  label: string;
  timeZone: string;
  disabled: boolean;
  onChange: () => void;
}) {
  const { dateField, timeField, label, timeZone, disabled, onChange } = props;
  const { control, watch, getValues, clearErrors, trigger } = useFormContext<TIssue>();
  const date = watch(dateField);
  const id = useId();
  const [rawTime, setRawTime] = useState(() => utcScheduleToLocal(getValues(timeField), timeZone).slice(11));
  const [localError, setLocalError] = useState("");
  const { field, fieldState } = useController({
    control,
    name: timeField,
    rules: {
      validate: () => {
        if (!rawTime) return true;
        if (!date) return "Set a date before adding a time.";
        try {
          const instant = localScheduleToUtc(`${date}T${rawTime}`, timeZone);
          const other = getValues(timeField === "start_time" ? "target_time" : "start_time");
          if (other && (timeField === "start_time" ? Date.parse(instant) > Date.parse(other) : Date.parse(instant) < Date.parse(other))) {
            return "End time cannot precede start time.";
          }
          return true;
        } catch (error) {
          return error instanceof Error ? error.message : "Enter a valid time.";
        }
      },
    },
  });

  useEffect(() => {
    setRawTime(utcScheduleToLocal(field.value, timeZone).slice(11));
    setLocalError("");
  }, [field.value, date, timeZone]);

  const changeTime = (time: string) => {
    setRawTime(time);
    setLocalError("");
    clearErrors(timeField);
    try {
      field.onChange(time && date ? localScheduleToUtc(`${date}T${time}`, timeZone) : null);
      onChange();
    } catch (error) {
      // Keep the typed value so Controller validation also blocks form submit.
      setLocalError(error instanceof Error ? error.message : "Enter a valid time.");
    }
  };

  if (!date) return null;
  const error = localError || fieldState.error?.message;
  return (
    <div className="min-w-44 space-y-1 text-body-xs-regular">
      <label htmlFor={id} className="text-secondary">{label} (optional)</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          ref={field.ref}
          type="time"
          step={60}
          name={field.name}
          value={rawTime}
          disabled={disabled}
          onChange={(event) => changeTime(event.target.value)}
          onBlur={() => { field.onBlur(); void trigger(timeField); }}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="rounded-sm border border-subtle-1 bg-transparent px-2 py-1"
        />
        {rawTime && <button type="button" disabled={disabled} onClick={() => changeTime("")}>Clear</button>}
      </div>
      {error && <div id={`${id}-error`} role="alert" className="text-danger-primary">{error}</div>}
    </div>
  );
}

export function IssueFormOptionalTimes(props: { timeZone: string; disabled: boolean; onChange: () => void }) {
  const { watch } = useFormContext<TIssue>();
  const startDate = watch("start_date");
  const targetDate = watch("target_date");
  return (
    <div className="mt-3 space-y-1">
      <div className="flex flex-wrap gap-4">
        <OptionalFormTime {...props} dateField="start_date" timeField="start_time" label="Start time" />
        <OptionalFormTime {...props} dateField="target_date" timeField="target_time" label="End time" />
      </div>
      {(startDate || targetDate) && <div className="text-body-xs-regular text-placeholder">{props.timeZone}</div>}
    </div>
  );
}
