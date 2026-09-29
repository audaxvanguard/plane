# Optional work-item times

Work-item details now offer **Add time (optional)** beneath start and due dates.
Select a date first, choose the optional local date/time, then **Save time**.
**Clear** removes only the time; the existing date remains. No time is required.
Display and input use the timezone selected in the user's profile (browser timezone
is the fallback). Dates with no time retain their previous behavior.

The API adds nullable `start_time` and `target_time` ISO-8601 timestamps alongside
unchanged `start_date` / `target_date` fields. PostgreSQL stores absolute instants;
API responses use UTC. A time requires its associated date. If both instants exist,
end must not precede start. Date-only edits to a different day clear that endpoint's
old instant, including timeline bulk moves, rather than retaining an inconsistent
hidden timestamp. Clearing a date clears its time. Issue versions include timestamps,
and explicit time changes appear in work-item activity history.

Times can be edited in **full work-item details**, the **quick-view panel**, and
the **creation/update dialog**. In the dialog, select dates first; optional time
inputs appear below the property buttons and are included in the main Save action.
Drafts also preserve the optional times. Changing a dialog date clears its old time.
Existing list, calendar, timeline, date-filter and overdue calculations remain
date-based; this is not hourly calendar scheduling or timed reminders.

DST gaps are rejected. During a repeated clock hour the converter selects one valid
occurrence deterministically; choosing between the two occurrences is not exposed
in this first version.

Migration `0123_issue_optional_times` adds four nullable columns to Issue and
IssueVersion with no backfill. Existing rows keep NULL times. Older images can read
the unchanged date fields with the extra columns present; rolling back the image
does not remove or expose saved times. Do not reverse the migration without first
backing up any new time data.

Migration `0124_draft_optional_times` additionally adds nullable start/end timestamp
columns to DraftIssue. Work items and drafts share the same schedule validation.

## Focused tests

```sh
node --experimental-strip-types --test deployments/audax/test_optional_times.mjs
node --test deployments/audax/test_time_surfaces.mjs
```

A standalone browser fixture and Playwright interaction test are included as
`time-controls-fixture.tsx` / `test_time_controls_browser.mjs`. Follow the copy/setup
instructions in the browser test header; they mount the actual React controls with
react-hook-form, and never connect to production or use real account data.

Serializer tests are `plane.tests.unit.serializers.test_issue_optional_times`.
They can run through Django's test runner or unittest in a configured Django shell;
these tests use unsaved models and do not require database access.

`optional_times_roundtrip.run_roundtrip()` exercises actual PostgreSQL persistence.
It intentionally refuses any database not named `plane_test`; run only with an
isolated test database. The migration was tested on an isolated PostgreSQL container
before production deployment. Deployment makes a fresh production backup first.
