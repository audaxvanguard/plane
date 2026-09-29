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

This first increment edits/displays times in **work-item details**. Existing list,
calendar, timeline, date-filter and overdue calculations remain date-based; this
is not hourly calendar scheduling, timed reminders, or time-based overdue alerts.
Creation dialogs remain date-only: create the item, then optionally add times.

DST gaps are rejected. During a repeated clock hour the converter selects one valid
occurrence deterministically; choosing between the two occurrences is not exposed
in this first version.

Migration `0123_issue_optional_times` adds four nullable columns to Issue and
IssueVersion with no backfill. Existing rows keep NULL times. Older images can read
the unchanged date fields with the extra columns present; rolling back the image
does not remove or expose saved times. Do not reverse the migration without first
backing up any new time data.

## Focused tests

```sh
node --experimental-strip-types --test deployments/audax/test_optional_times.mjs
```

Serializer tests are `plane.tests.unit.serializers.test_issue_optional_times`.
They can run through Django's test runner or unittest in a configured Django shell;
these tests use unsaved models and do not require database access.

`optional_times_roundtrip.run_roundtrip()` exercises actual PostgreSQL persistence.
It intentionally refuses any database not named `plane_test`; run only with an
isolated test database. The migration was tested on an isolated PostgreSQL container
before production deployment. Deployment makes a fresh production backup first.
