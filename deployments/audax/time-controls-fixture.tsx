// SPDX-License-Identifier: AGPL-3.0-only
// Standalone browser fixture: mounts the actual controls, never production data.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { FormProvider, useForm } from "react-hook-form";
import { IssueFormOptionalTimes } from "./optional-times";
import { OptionalIssueTime } from "./optional-time";

function Fixture() {
  const initial = { start_date: "2026-10-01", target_date: "2026-10-01", start_time: null, target_time: null };
  const form = useForm({ defaultValues: initial });
  const [timeZone, setTimeZone] = useState("America/Sao_Paulo");
  const [submitted, setSubmitted] = useState("");
  const [quick, setQuick] = useState(initial);
  const [disabled, setDisabled] = useState(false);
  return <>
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((data) => setSubmitted(JSON.stringify(data)))}>
        <IssueFormOptionalTimes timeZone={timeZone} disabled={false} onChange={() => {}} />
        <button type="submit">Create item</button>
        <button type="button" onClick={() => { form.reset(initial); setSubmitted(""); setTimeZone("America/Sao_Paulo"); }}>Reset form</button>
        <button type="button" onClick={() => { form.setValue("start_time", null); form.setValue("start_date", "2026-10-02"); }}>Change start date</button>
        <button type="button" onClick={() => { form.setValue("start_time", null); form.setValue("target_time", null); form.setValue("start_date", null); form.setValue("target_date", null); }}>Remove dates</button>
        <button type="button" onClick={() => { form.reset({ ...initial, start_date: "2026-03-08", target_date: "2026-03-08" }); setSubmitted(""); setTimeZone("America/New_York"); }}>DST scenario</button>
        <button type="button" onClick={() => form.reset({ ...initial, start_time: "2026-10-01T17:30:00Z", target_time: "2026-10-01T17:30:00Z" })}>Equal instants</button>
      </form>
    </FormProvider>
    <pre id="submitted">{submitted}</pre>
    <section id="quick-start">
      <OptionalIssueTime label="Start time" date={quick.start_date} value={quick.start_time}
        timeZone="America/Sao_Paulo" disabled={disabled}
        onSave={async (instant, day) => setQuick((old) => ({ ...old, start_time: instant, start_date: day || old.start_date }))} />
    </section>
    <section id="quick-end">
      <OptionalIssueTime label="End time" date={quick.target_date} value={quick.target_time}
        timeZone="America/Sao_Paulo" disabled={disabled}
        onSave={async (instant, day) => {
          const before = quick;
          setQuick((old) => ({ ...old, target_time: instant, target_date: day || old.target_date }));
          // Reproduce the real MobX store's optimistic update followed by rollback.
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (instant && before.start_time && Date.parse(instant) < Date.parse(before.start_time)) {
            setQuick(before);
            throw new Error("End time cannot precede start time.");
          }
        }} />
    </section>
    <pre id="quick-values">{JSON.stringify(quick)}</pre>
    <button onClick={() => setDisabled((value) => !value)}>Toggle read-only</button>
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
