# Project Custom Fields and Saved CRM Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional project-defined item fields and customizable saved project views with accurate BRL pipeline totals.

**Architecture:** Add typed field definitions/values and a shared validation/query layer. Extend existing IssueView records and existing issue editing/layout components; reuse current project/item/view authorization. Compute decimal totals server-side over the same authorized, unpaginated item sets used by list queries.

**Tech Stack:** Django/DRF, PostgreSQL, React/TypeScript, MobX, react-hook-form, existing Plane UI components, pytest and browser tests; resource-limited Docker/BuildKit on the VPS.

**Spec:** `docs/superpowers/specs/2026-10-03-project-custom-fields-and-views-design.md` (approved).

## Global Constraints

- Project-scoped, opt-in fields; no automatic CRM field creation or item backfill. Existing projects/items/views retain existing behavior.
- Six types: text (2,000 characters), number (24 digits including 6 fractional digits), currency (18 digits including 2 fractional digits), date, checkbox and single select.
- All currency is BRL; decimal strings on the API, decimal-safe storage/calculation/formatting, pt-BR currency display. Signed values are allowed; precision overflow, NaN and infinity are rejected.
- Optional values: unset is neither zero nor false. PATCH omission preserves a value; explicit null clears it.
- At most 50 active fields/project and 100 options/select field. Stable UUIDs, normalized unique project field names, immutable field types, archive/restore and retire-option semantics.
- Admin-only schema changes; item writes and saved-view access/ownership/locking retain existing authorization.
- Custom filters are AND conditions; group custom fields only by select/checkbox. Sorting uses unset-last and an item-ID tie-breaker.
- List, Kanban and spreadsheet customization; calendar/timeline scheduling remains unchanged. No formulas, cross-project rollups, automation, charts, relations, currency conversion or new move/duplicate subsystem.
- All/open/filtered totals; open excludes completed/cancelled state groups. No deleted, archived or draft items. Honor sub-item inclusion; overall totals deduplicate issue IDs.
- Every test/build container enters `audax-build.slice`; shared 6 GiB RAM, zero swap, 1.5 CPUs, serial builds/checks, host-pressure monitor and 25 GiB build disk preflight. Never enlarge limits automatically.
- Production secrets stay outside the public fork. Preserve databases/uploads/backups, existing schedules and OmniRoute configuration. No production deploy before verification and review checkpoints.

## Review Focus

1. A field is archived or an option retired while an editor is open: reject new invalid assignments without losing unsaved input or existing stored values (Tasks 3, 6).
2. A user guesses another tenant's field/option/private-view UUID: no read/write/aggregate leakage, including nested configuration (Tasks 2, 3, 4, 5).
3. Zero, false, unset, negative and beyond-JavaScript-safe-integer amounts: distinct filter semantics and exact display/sums (Tasks 3, 5, 6).
4. A filtered result spans several pages or repeats an issue through labels/groups: aggregate the full matching set, not a page or multiplied join (Task 5).
5. A slow/failed save or out-of-order aggregate response arrives after navigation/filter changes: preserve drafts and never display a stale result as the current saved total (Tasks 6, 10).

---

## File and interface map

Keep the additions focused; do not rewrite large existing stores or issue views wholesale.

- `apps/api/plane/db/models/custom_field.py`: definitions, select options, typed issue values.
- `apps/api/plane/app/serializers/custom_field.py`: scalar/value/schema validation and definition serialization.
- `apps/api/plane/app/services/custom_fields.py`: atomic values, authorization-aware field lookup, audit snapshots and draft transfer.
- `apps/api/plane/app/services/custom_field_queries.py`: validated view config, custom predicates/sort/group and aggregate execution.
- `apps/api/plane/app/views/project/custom_fields.py`, `apps/api/plane/app/urls/custom_fields.py`: field metadata, option administration and aggregates routes.
- `packages/types/src/custom-fields.ts`: public field/value/view/aggregate types, re-exported from the types package.
- `apps/web/helpers/custom-fields.ts`: locale input normalization and decimal-safe presentation.
- `apps/web/core/services/custom-field.service.ts`, `apps/web/core/store/project/custom-field.store.ts`, `apps/web/core/hooks/use-custom-fields.ts`: project metadata, API operations and observable state.
- `apps/web/core/components/issues/custom-fields/`: shared editor, form controller and read-only renderer.
- `apps/web/core/components/project/settings/custom-fields/`: field/option management.
- `apps/web/core/components/views/custom-fields/`: column/filter/sort/group/metric controls and totals.
- `deployments/audax/run_custom_fields_tests.py`, `custom-fields-test-compose.yml`: bounded, isolated API and browser test harness.
- `apps/api/plane/tests/unit/serializers/test_custom_field_validation.py`, `plane/tests/contract/app/test_custom_fields_app.py`, `test_custom_views_app.py`, `test_custom_field_aggregates_app.py`: validation, authorization, persistence and reporting tests.
- `deployments/audax/test_custom_fields.mjs`, `test_custom_fields_browser.mjs`: frontend helper/editor and real application browser regressions.

### Contract decisions used by every task

`FieldKind = text | number | currency | date | checkbox | select`.

`CustomValue = string | boolean | null`; decimal/date/text/option UUIDs use strings, never JSON numeric amounts. `custom_values: Record<field_uuid, CustomValue>` is the issue/draft API property. An absent key means unset on GET and unchanged on PATCH. Draft project changes with existing custom values require write-only `confirm_clear_custom_values:true`; an empty PATCH mapping alone is not clearing confirmation. Unassigned drafts may contain no custom values.

`ProjectCustomViewConfig` is a versioned JSON object:

```json
{"version":1,"columns":[],"conditions":[],"sort":null,"group_by":null,"metrics":[]}
```

Columns are `{kind:"builtin",key:string}` or `{kind:"custom",field_id:uuid}`. Conditions are `{field_id,operator,value?}`. Sort is `{field_id,direction:"asc"|"desc"}`; custom group is `{field_id}`. Metrics are `{field_id,scopes:["all"|"open"|"filtered"]}`. Empty `{}` on legacy views disables the extension. Built-in grouping/filter settings stay in their existing fields.

Project endpoints, below `/api/workspaces/{slug}/projects/{project_id}/`:
- `custom-fields/`: GET metadata (including archived definitions needed by existing views), POST definition.
- `custom-fields/{field_id}/`: PATCH metadata/archive/order; type is immutable.
- `custom-fields/{field_id}/options/` and `.../options/{option_id}/`: POST/PATCH option metadata/retirement.
- `custom-fields/aggregates/`: POST `{view_id?,custom_view?,filters?,rich_filters?,display_filters?}`; validate an optional view_id against current private/public access before applying temporary overrides.

Issue/project-view list requests accept an optional bounded `custom_view` JSON query parameter (maximum 32 KiB, maximum 50 conditions). Saved project views store `custom_view` alongside existing built-in configuration. Workspace-wide views reject nonempty custom configuration. Existing project-view access rules also govern any supplied view_id; knowing the UUID is not authorization.

Aggregate response: `metrics:[{field_id,type,scopes:{all?:{total,item_count,valued_count,missing_count},open?:...,filtered?:...},groups:[{key,label,scopes:...}]}]`, plus `groups_may_overlap:boolean`. Totals are decimal strings; counts are integers. Group keys use stable IDs/boolean/unset keys, not translated labels.

## Task 1: Bounded isolated test execution

**Files:** Create `deployments/audax/run_custom_fields_tests.py`, `custom-fields-test-compose.yml`, `test_custom_fields_harness.py`; reuse `build_safety.py`. Create `apps/api/plane/tests/fixtures/__init__.py`, `custom_fields.py` and register the fixtures in `plane/tests/conftest.py` for reusable two-tenant project/role fixtures. Create test-only `deployments/audax/browser/package.json` and lockfile with Playwright Core 1.58.2 for the bounded browser runner.

**Interfaces:** `run_custom_fields_tests.py api [pytest arguments...]`, `helpers [test file]` and `browser --fixture [script] | --full-app` launch the same protected unit/lock/host monitor as builds. Helpers use resolved Node executable with a 128 MiB heap/256 MiB service limit; browser smoke can initially use about:blank, and real application mode is completed in Task 11. `run_api_tests(args: list[str]) -> None` operates only on a private test stack/database named `plane_custom_fields_test`; no production env_file, credentials, bind-writable source, ports or volumes.

- [ ] Write failing harness tests asserting every service's `cgroup_parent` equals `audax-build.slice`, memory-swap equals memory, no build runs concurrently with test containers, and database URL cannot point at the production host/name. Fixtures expose `crm_project`, `crm_admin`, `crm_member`, `crm_viewer`, `other_project`, `other_admin`, matching `crm_admin_client`/`crm_member_client`/`crm_viewer_client`, and `project_endpoint(project, suffix) -> str`. Add `assert_test_database(url: str) -> None` to the harness; only the isolated test service/name is allowed.
- [ ] Run `python3 deployments/audax/test_custom_fields_harness.py`; confirm policy/entrypoint tests fail before implementation.
- [ ] Implement the wrapper and isolated Compose file: Postgres 1 GiB, API tests 3 GiB, Redis 128 MiB, RabbitMQ 512 MiB and test MinIO 256 MiB; shared parent still caps total RAM at 6 GiB. Build a development test image using the protected builder and generated bounded Dockerfile, then stop it before tests. Use only the disposable `audax-plane-custom-fields-test:working` image tag, never a deployable revision tag; allow uncommitted source mounts for TDD. Bind source read-only with writable test temp/static directories, PYTHONDONTWRITEBYTECODE=1 and pytest cacheprovider disabled. Apply fixtures only to the isolated database; clean up only the named test project's containers/tmpfs volumes in finally. Do not run the repository's unconstrained `up --build` command or overwrite `apps/api/.env`.
- [ ] Run the harness tests and `python3 deployments/audax/run_custom_fields_tests.py api plane/tests/unit/serializers/test_issue_optional_times.py -q`; expect passing tests and no production container changes. Confirm teardown works after intentional failure/interruption.
- [ ] Commit the harness/fixtures: `test: add bounded custom-fields test harness`.

## Task 2: Field models and admin/read metadata API

**Files:** Create model/serializer/views/urls from the file map; modify `apps/api/plane/db/models/__init__.py`, `plane/app/urls/__init__.py`. Create migration `0125_project_custom_fields.py`, `plane/tests/contract/app/test_custom_fields_app.py` and model tests `plane/tests/unit/models/test_custom_fields.py`.

**Interfaces:** `ProjectCustomField`, `ProjectCustomFieldOption`, `IssueCustomFieldValue`; field/option routes above. Add `resolve_fields(project_id: UUID, ids: list[UUID], *, for_write: bool) -> dict[UUID, ProjectCustomField]` to the service. Metadata includes `id,name,description,type,sort_order,is_archived,options`; no per-item values here. Test fixtures export `field_factory(project, kind, name=None)` and `currency_field` in `crm_project`.

- [ ] Write tests: normalized duplicate names fail; admin creates six types; member/viewer cannot change schema; foreign option/field IDs return inaccessible/not-found; restoring above 50 active fields fails; the 101st option fails even if old options were retired. Model tests assert unique issue/field, exactly one non-null typed value column and indexes. Count/type rules run inside project/field locks to prevent simultaneous-create bypass.
- [ ] Run `python3 deployments/audax/run_custom_fields_tests.py api plane/tests/contract/app/test_custom_fields_app.py plane/tests/unit/models/test_custom_fields.py -q`; confirm failures for missing models/routes.
- [ ] Implement definitions/options/value columns and metadata serialization. Store normalized `name_key` with project uniqueness; allow renaming descriptions/colors/order, not type. One decimal column has 24/6 storage capacity; currency's stricter 18/2 rule belongs to validation. SQL CHECK enforces one value column, application validation enforces field type/project. Archive/retire instead of destructive deletion. Role checks belong to endpoint and queryset boundaries, not merely disabled buttons.
- [ ] Run tests plus isolated migration forward/backward/forward before any data; expect correct models/constraints and unchanged existing issue/view defaults. `makemigrations --check --dry-run` must report no pending changes.
- [ ] Commit: `feat: add project custom-field definitions and permissions`.

## Task 3: Atomic values and draft lifecycle

**Files:** Modify `plane/app/serializers/custom_field.py`, create/extend `plane/app/services/custom_fields.py`; modify `plane/app/serializers/issue.py`, `draft.py`, `plane/app/views/issue/base.py`, `plane/app/views/workspace/draft.py`, `plane/db/models/draft.py`, `plane/api/serializers/issue.py` and `plane/api/views/issue.py`. Create the service package's `__init__.py`; include external-token tests in `plane/tests/contract/api/test_issue_custom_fields_api.py`. Create migration `0126_draft_custom_values.py`; extend validation/contract tests and `plane/app/serializers/view.py` list representation.

**Interfaces:** `validate_scalar(field: ProjectCustomField, raw: object) -> str | bool | None`; `apply_custom_values(issue: Issue, patch: dict[str,object], *, actor: User) -> list[dict]`; `serialize_custom_values(issue: Issue) -> dict[str,str|bool]`; `validate_draft_values(project: Project | None, patch: dict, existing: dict) -> dict`; allow an unassigned draft only with an empty resulting mapping; `promote_draft_values(draft: DraftIssue, issue: Issue, *, actor: User) -> None`. Returned change snapshots feed Task 7 history. Definitions must be prefetched/batched.

- [ ] Write tests pinning `validate_scalar(currency,"0.10") == "0.10"`, currency "1.001"/NaN/infinity/bool rejection, 24/6 number limits, 2,001-character rejection, invalid calendar dates, false versus unset, invalid/retired/foreign options. Contract tests prove PATCH omission/null, creation rollback, promotion atomicity, viewer read-only and foreign field rejection. Anonymous/published portal serializers must not acquire CRM custom values merely because a shared serializer was extended; those portals are outside this release. An unchanged stored retired option is permitted, a new assignment is not; an archived-field edit returns an error without deleting its value. Promotion preserves previously saved archived-field/retired-option values from the authoritative draft baseline; direct creation cannot invent such assignments. Test unassigned drafts, confirmed project changes and empty-map PATCH preservation.
- [ ] Run validation and field contract suites through the API wrapper; confirm expected red assertions, not unrelated database/bootstrap failures.
- [ ] Implement typed normalization without float conversion; reject numeric JSON tokens for number/currency (the contract requires decimal strings), and normalize blank text/input to unset without treating false/zero as blank. Wire custom_values into create/update/list/detail and transactional draft save/promotion. Store optional draft JSON with validated stable IDs. On draft project change, refuse existing-value transfer without the write-only confirmation flag; with confirmation clear the old baseline before validating any destination values. Promote stored historical values without confusing preservation with a new assignment. All writable authenticated entrypoints share validation; external-token/integration issue serializers cannot circumvent it. Keep custom_values out of anonymous/published portal responses in this release; do not modify apps/space or expose CRM data through common serializer reuse. Preserve archived values on ordinary unrelated edits. Make project identity read-only where current API already does so; do not add a new move endpoint. Export `clear_project_values(issue, *, actor, confirmed: bool) -> list[dict]` that refuses unconfirmed clearing and supplies history snapshots for authorized project-transfer paths. Cross-project copy never accepts source IDs.
- [ ] Run lifecycle/permissions tests with source/destination fixtures, including copied issues and project-changed drafts; expect values survive same-project promotion/copy and invalid cross-project operations roll back. Assert list query count grows by a bounded batch, not number of items/fields. Run optional-time regressions.
- [ ] Commit: `feat: persist typed item and draft custom values atomically`.

## Task 4: Validated saved-view configuration and query integration

**Files:** Create `plane/app/services/custom_field_queries.py`; modify `plane/db/models/view.py`, `plane/app/serializers/view.py`, `plane/app/views/view/base.py`, `plane/app/views/issue/base.py`, `plane/utils/grouper.py`, `plane/utils/paginator.py`, `plane/utils/order_queryset.py`; create migration `0127_issue_view_custom_configuration.py` and `plane/tests/contract/app/test_custom_views_app.py`.

**Interfaces:** `validate_custom_view(project: Project, raw: object) -> dict`; `apply_custom_conditions(queryset: QuerySet[Issue], config: dict) -> QuerySet[Issue]`; `apply_custom_sort(queryset, config) -> QuerySet[Issue]`; `get_custom_group(field: ProjectCustomField) -> dict` returns a server-owned annotation/bucket mapping compatible with existing grouping pagination (select UUIDs; checkbox "true"/"false"; "unset" for missing values, never a falsy bucket key); `resolve_view_config(*, user, project, view_id, override) -> dict`. Add `IssueView.custom_view` JSON default `{}`.

- [ ] Write tests for six typed operator families, AND composition with built-in filters, unset-last asc/desc, deterministic pagination ties, select/checkbox grouping, SQL-path/operator injection rejection, foreign/private view IDs, archived field references, unknown legacy properties, duplicate columns and 32 KiB/50-condition bounds. Saving custom config must not reset omitted existing filters. Workspace views reject nonempty custom config.
- [ ] Run `python3 deployments/audax/run_custom_fields_tests.py api plane/tests/contract/app/test_custom_views_app.py -q`; confirm unsupported config/filter assertions fail.
- [ ] Implement whitelisted validation. Filter through correlated Exists/subqueries to avoid multiplying issue rows; use typed sort annotations with nulls_last and id tie-breakers. Text sorts case-insensitively; select sorts by configured option order (then option ID); checkbox sorts false before true; dates/numbers/currency use their native typed order. Test option reorder and ties. Extend existing view serializer/update logic with PATCH-preservation semantics. Apply custom filtering/sorting and a whitelisted group annotation before pagination to project issue and project saved-view paths; preserve workspace behavior. Wire custom-group buckets into the existing grouper/paginator response shape, not a parallel incompatible pagination format. Keep existing access/is_locked metadata read-only; do not introduce privacy/licensing controls. Missing/inaccessible views must return a scoped not-found response, not an AttributeError. Use read-capable archived/retired definitions for existing saved filters, but disallow choosing them in new editing controls. Empty legacy custom config follows the old path exactly.
- [ ] Run tests plus existing issue/view contract suites; assert built-in permissions/query sanitizers remain intact and all query routes agree on results.
- [ ] Commit: `feat: add validated custom fields to saved project view queries`.

## Task 5: Exact all/open/filtered and grouped sums

**Files:** Extend `plane/app/services/custom_field_queries.py`, `plane/app/views/project/custom_fields.py` and routes; create `plane/tests/contract/app/test_custom_field_aggregates_app.py`.

**Interfaces:** `aggregate_custom_fields(*, user: User, project: Project, config: dict, builtin_filters: dict, rich_filters: dict, display_filters: dict) -> dict` returns the aggregate response above. `eligible_custom_items(*, user, project, include_subissues: bool) -> QuerySet[Issue]` shares current item permission predicates, including guest creator restrictions.

- [ ] Write decimal fixtures: backlog 100.10, started 200.20, completed 300.30, cancelled 400.40; assert all "1001.00", open "300.30", filtered-on-started "200.20". Cover negative, zero, unset, checkbox-not-a-metric, archived/deleted/drafts exclusion, sub-items, translated CRM state labels, empty counts and private/foreign IDs. Add 101 matching items with page size 30 and overlapping labels: overall sum counts each once; overlap flag/group subtotals are explicit. Test numeric six-place sums and BRL totals exceeding JS safe integer limits.
- [ ] Run the aggregate suite with the bounded API wrapper; confirm missing endpoint/calculation fails.
- [ ] Implement DB decimal SUM over unique eligible issue IDs, not joined label/value fan-out. Derive all/open from base eligibility and filtered from the same custom/built-in filter compiler as Task 4. Compute selected scopes only, preserve exact decimal strings and counts (including sums beyond the individual field's precision; no default-context quantization/float conversion), include per-group scope results and an overlap flag. Reject metric fields from other projects or nonnumeric types.
- [ ] Run aggregate/view suites; compare response totals to independently computed Decimal fixture sums and assert totals ignore pagination but respect authorization/sub-item eligibility.
- [ ] Commit: `feat: calculate permission-safe BRL pipeline totals`.

## Task 6: Frontend contracts, metadata store and reusable editors

**Files:** Create `packages/types/src/custom-fields.ts` and re-export in `packages/types/src/index.ts`; extend `issues/issue.ts`, `views.ts`, `view-props.ts`. Add a discriminated custom-column type and validated custom-group token to the project layout types; do not weaken them to unrestricted any/string or change global workspace grouping. Create frontend helper/service/store/hook/editor files from map; register store in `core/store/root.store.ts`. Create `deployments/audax/test_custom_fields.mjs` and a focused browser editor fixture.

**Interfaces:** `TProjectCustomField`, `TCustomValues`, `TCustomViewColumn`, `TProjectCustomViewConfig`, `TCustomFieldAggregates`; export `CustomValue` as the singular scalar alias declared in the contract; `formatBRL(value: string) -> string`, `normalizeCustomInput(field, raw: string|boolean) -> CustomValue`; store `fetchFields(slug,projectId)`, `getFields(projectId)`, `invalidateProject(projectId)`. `CustomFieldEditor({field,value,onSave,disabled})` returns JSX; `CustomFieldFormFields({fields})` consumes react-hook-form context; `CustomFieldDisplay({field,value})` is read-only.

- [ ] Write helper tests asserting exact 0.10, negative amounts, pt-BR input/display and `9007199254740992.01` rendering without cent loss. Fixture tests distinguish checkbox false from clear; rejected/late saves retain input and error; a field archived mid-edit cannot be newly saved. Date YYYY-MM-DD remains a date across browser timezones. Text/options render as escaped text, not HTML.
- [ ] Run helper tests with `python3 deployments/audax/run_custom_fields_tests.py helpers deployments/audax/test_custom_fields.mjs`; run the editor fixture through the bounded browser wrapper and confirm missing helpers/components fail.
- [ ] Implement decimal-safe parsing/formatting (string/BigInt helpers, no floating-point calculations or extra production dependency). Match existing MobX/service conventions and explicit error propagation. Store metadata by project ID and stable field IDs; prefetch on project/item entry. Editors share field-level validation and preserve pending drafts during optimistic updates/rollback. Add labels/messages to EN and PT locale files, with existing locale fallback for other languages.
- [ ] Run helpers/editor fixtures; run protected frontend type checks at the next clean-commit checkpoint. Verify stores never merge different projects' similarly named fields.
- [ ] Commit: `feat(web): add custom-field contracts and shared typed editors`.

## Task 7: Audit history and all item entry/edit surfaces

**Files:** Modify `plane/bgtasks/issue_activities_task.py` and create frontend activity action `core/components/issues/issue-detail/issue-activity/activity/actions/custom-field.tsx`; register in action index/activity-list. Modify `issue-modal/form.tsx`, `issue-modal/components/default-properties.tsx`, `issue-detail/sidebar.tsx`, `issue-detail/root.tsx`, `peek-overview/properties.tsx`, `peek-overview/root.tsx`, `core/store/issue/helpers/base-issues.store.ts` and `core/store/issue/workspace-draft/issue.store.ts`.

**Interfaces:** Changes from Task 3 contain field UUID/name/type and serialized before/after snapshots. Shared editors from Task 6 use existing issue update operations; use stable `custom-field-{field_id}` and `custom-field-{field_id}-input` test IDs, plus `pipeline-total-{field_id}-{scope}` for totals; payload is `custom_values`, not a second uncoordinated save after item creation. Draft/project selection helper `prepareDraftProjectChange(values,oldProject,newProject,confirmed) -> TCustomValues` requires confirmation when clearing incompatible data.

- [ ] Write browser/API cases for create, update, full details, peek, draft save/reopen/promote and failed-save retry; prove omitted optional fields do not become required. Rename/archive a field after editing and assert old history remains readable. Cross-project creation/copy/project-selection rejects source field IDs or clears only on confirmation; unconfirmed draft switch preserves both the selected project and its input.
- [ ] Run affected contract suites/editor browser tests; confirm these surfaces lack custom-value wiring/history before implementation.
- [ ] Wire editors into every named surface and current store updates; history uses existing activity infrastructure plus immutable label/type/value snapshots. Use activity field `custom_field:{uuid}` and JSON snapshots in existing old_value/new_value TextFields, including select label snapshots; this avoids an extra activity schema/migration and keeps renamed/retired options readable. Custom-value API errors must propagate to editors rather than toast-only swallowed success. Keep same-project active-field copy values (do not newly assign archived fields), clear cross-project copy values intentionally, submit the draft confirmation flag when a project switch was approved, and use the Task 3 confirmation guard for any supported project-transfer path. Do not implement currently unsupported licensed move functionality.
- [ ] Run all entry-surface cases and optional-time browser regressions. Assert creation is atomic, draft dates/times/custom values survive reset correctly, and no optimistic save dismisses errors.
- [ ] Commit: `feat(web): expose custom fields across item editors and history`.

## Task 8: Project-admin settings UI

**Files:** Create `core/components/project/settings/custom-fields/root.tsx`, `field-form.tsx`, `options-editor.tsx`; create `app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/custom-fields/page.tsx`. Modify `app/routes/core.ts`, `packages/constants/src/settings/project.ts`, `packages/types/src/settings.ts` and EN/PT locale keys.

**Interfaces:** Settings route `/[workspaceSlug]/settings/projects/[projectId]/custom-fields`; uses Task 6 store/service plus metadata routes. Field/option forms submit immutable type, editable metadata/order/archive/retire operations.

- [ ] Write admin/browser tests for six types, duplicate-name error, option retirement, reorder, archive/restore and 50/100 caps. A nonadmin cannot enter write controls or submit a forged schema write. Used-field type has no conversion control; archive confirmation says values/history are preserved.
- [ ] Run browser settings cases and API permissions suite; expect missing route/forms failures.
- [ ] Implement settings route/navigation and accessible forms with loading, empty and error states. Metadata mutations refresh affected item/view metadata; archive removes only active editor choices, not retained data or saved filters. Hide admin-only navigation from nonadmins without relying on that for API security.
- [ ] Run route/settings cases; verify on a seeded CRM project that adding Opportunity value exposes an optional BRL editor without modifying unrelated projects.
- [ ] Commit: `feat(web): add project custom-field administration`.

## Task 9: Saved-view editor and column/filter/sort/group integration

**Files:** Create `core/components/views/custom-fields/config-editor.tsx`, `columns-editor.tsx`, `filter-editor.tsx`; modify `core/components/views/form.tsx`, `modal.tsx`, `core/store/project-view.store.ts`, `core/store/issue/project-views/filter.store.ts`, `core/services/view.service.ts`, spreadsheet view/header/header-column/table/row, `issue-layouts/list/block.tsx`, `issue-layouts/kanban/block.tsx` and layout filter/header controls.

**Interfaces:** `CustomViewConfigEditor({projectId,config,onChange,canSave})` emits Task 6's config. `getViewColumns(config,legacyProperties,definitions) -> TCustomViewColumn[]` preserves legacy behavior for empty config. Temporary working config is keyed by view ID separately from persisted IProjectView.custom_view; save uses existing view update permission flow.

- [ ] Write browser cases for hide/show/reorder columns, inline spreadsheet editing, per-card/list properties, each typed filter, sort asc/desc and select/checkbox grouping. Test Kanban drag to false/unset/active-option groups, denied drops and rollback; archived fields/retired-option targets cannot accept a new assignment. Save/reload/duplicate a view and verify exact configuration. Unsaved changes must not alter the shared view for another reader; lock/private ownership rules apply. Existing workspace views and legacy project columns are unchanged. An archived field's saved filter/column remains explicit and read-only rather than silently widening results.
- [ ] Run view browser and backend config suites; confirm missing dynamic columns/config persistence fails.
- [ ] Implement editor controls and saved/temporary state. Keep existing builtin display properties; merge ordered built-in/custom columns without duplicates. Spreadsheet gets draggable column order and shared cell editors; list/Kanban render shared read-only properties. Custom-group Kanban drops submit `custom_values` through the shared update operation (false is a value, unset is null); do not send arbitrary group annotation names as issue properties. Disable invalid/read-only targets and restore the old bucket on rejected writes. Extend query-param plumbing to send validated custom_view before pagination; refresh layout data on custom filter/sort/group changes. Use new metadata only in project-scoped layouts, not global workspace layout assumptions.
- [ ] Run all view/layout tests; verify keyboard-accessible column ordering as well as pointer drag. Run the protected type check after committing the checkpoint.
- [ ] Commit: `feat(web): add customizable saved views and custom columns`.

## Task 10: Live totals controls and refresh correctness

**Files:** Create `core/components/views/custom-fields/totals.tsx`, `totals-controls.tsx`; extend custom-field service/store with aggregate requests, view config editor and project layout roots.

**Interfaces:** `fetchAggregates(slug,projectId,request) -> Promise<TCustomFieldAggregates>`; `CustomFieldTotals({projectId,config,builtinFilters,richFilters,displayFilters})`. Each request uses a config fingerprint/generation; only the latest matching response may update displayed totals.

- [ ] Write browser cases enabling all/open/filtered together, multiple metric fields, per-stage totals, missing counts and overlap explanation. Changing an amount/status/filter refreshes confirmed totals. A delayed response from an earlier view/filter is discarded; failed item save preserves prior confirmed totals and unsaved input. Empty projects still show zero with counts rather than hiding the totals component.
- [ ] Run totals browser and aggregate contract tests; confirm missing totals display/refresh behavior fails.
- [ ] Implement selected scopes/metrics and compact labelled totals above list/Kanban/spreadsheet, including no-items layouts. Invalidate on confirmed custom-value/status/archive/delete changes; apply generation checks to prevent stale overwrites. Display large decimals through Task 6 helpers, not parseFloat/reduce. Group headers consume server group sums and show overlap explanation only when relevant.
- [ ] Run live refresh/empty/large-decimal tests and compare displayed totals to fixture API results across pagination.
- [ ] Commit: `feat(web): display live BRL pipeline totals in project views`.

## Task 11: Full-stack browser acceptance and regression gate

**Files:** Create `deployments/audax/test_custom_fields_browser.mjs`, `custom-fields-browser-compose.yml`, `CUSTOM_FIELDS.md`; reuse Task 1's test-only browser package/lockfile; extend bounded harness and regression tests.

**Interfaces:** Browser command from Task 1 runs the compiled candidate web/backend/proxy against isolated seeded services, never production mutations. Use Playwright Core 1.58.2 and matching `mcr.microsoft.com/playwright:v1.58.2-noble` in a 1 GiB, no-swap, low-priority container in the same slice; static web/proxy services get 64/32 MiB limits, respectively. All share the 6 GiB cap; do not run unrelated check/build containers simultaneously. Do not docker-exec browser processes into an uncapped devbox. Build serially, stop the builder, then run the test stack.

- [ ] Write end-to-end cases that navigate the real settings page, create six fields, create/reopen/edit items in each surface, preserve a draft, configure/save/reopen views, check admin/member/viewer access and compare all/open/filtered BRL totals. Include separate users/projects and stale-save/filter response cases; no fixture-only substitute for real routes. Tests should fail until all approved UI behavior exists.
- [ ] Run `python3 deployments/audax/run_custom_fields_tests.py browser`; capture failing cases/screenshots only in the private test state, not the public repo.
- [ ] Complete real-stack boot/seed/session helpers, missing integrations and docs. Document field setup, state-group mapping for CRM won/lost, totals/counts/overlap, supported filters/grouping and migration/rollback limits. Clean up test images/containers without removing rollback assets or source files. Avoid installing new global dependencies in Carol's container.
- [ ] Run the full custom-field API suite, existing relevant issue/view/optional-time regressions, helpers, actual browser tests and protected frontend types/lint. Record query counts and verify all defined view/item permissions before passing the gate. Perform whole-branch review; independent review requires a separate reviewer session if no subagent tool is available.
- [ ] Commit any final corrections/docs: `test: verify custom fields and CRM views end to end`.

## Task 12: Explicit protected production rollout

**Files:** Update `deployments/audax/CUSTOM_FIELDS.md` with verified release evidence; production Compose/backup state remain outside Git. Do not alter resource caps or unrelated runtime settings.

**Interfaces:** Existing `deploy.py build`, `deploy.py deploy --allow-migrations`, `deploy.py status`; additive migrations 0125–0127 and current production baseline 663c328fd787. Confirm the actual baseline/revision again rather than assuming it has not changed during implementation.

- [ ] Add/review the release checklist with required API/browser evidence, migration inspection, free-disk/pressure checks and compatible-image availability; any missing item blocks rollout.
- [ ] Run `python3 deployments/audax/test_deploy.py`, `test_build_safety.py`, custom-field harness tests, `git diff --check`, isolated `makemigrations --check --dry-run` and the completed acceptance suites. Require clean source and at least 25 GiB free disk; ensure no other build/test unit holds the lock.
- [ ] Review the feature worktree/branch against the production branch, then integrate the approved candidate into `audax-production` and the persistent `/opt/plane-audax` checkout without discarding unrelated work. Commit/push the reviewed candidate, build with `python3 deployments/audax/deploy.py build`, and inspect its successful checks. If the build OOMs/refuses/aborts, report and stop; do not raise RAM/swap limits or deploy partial images. After the rollout checkpoint approval, run `deploy.py deploy --allow-migrations` to back up, migrate and replace apps using the existing workflow.
- [ ] Verify application/API/live HTTP health, migration presence, signed image upload, login/project views and authorized custom-field save/read/clear. Use a disposable clearly named smoke item/project only with explicit rollout consent, and remove it afterward. Existing real CRM data must not be bulk changed or seeded automatically. Confirm draft, peek and saved-view totals visually in production before declaring the feature complete.
- [ ] Record release tag/tests/backup path and remaining limitations in deployment notes; commit documentation without triggering another app deploy. Keep compatible rollback images and backups. No automatic database downgrade.

## Concrete test anchors

These are minimum named assertions for each task's red/green cycle, in addition to the cases listed in its test step. Fixture setup uses that task's interfaces and the shared fixtures; imports are from the files named above.

```python
# Task 1: test_production_database_is_refused
with pytest.raises(RuntimeError):
    assert_test_database("postgresql://plane:dummy@plane-db:5432/plane")

# Task 2: test_member_cannot_create_field
response = crm_member_client.post(project_endpoint(crm_project, "custom-fields/"),
                                  {"name": "Opportunity value", "type": "currency"}, format="json")
assert response.status_code == 403

# Task 3: test_currency_is_exact_and_excess_precision_rejected
assert validate_scalar(currency_field, "0.10") == "0.10"
with pytest.raises(ValidationError):
    validate_scalar(currency_field, "1.001")

# Task 4: test_currency_cannot_be_a_custom_group
with pytest.raises(ValidationError):
    validate_custom_view(crm_project, {"version": 1, "group_by": {"field_id": str(currency_field.id)}})

# Task 5: test_all_open_filtered_totals
# pipeline_response is the POST result for the four-state decimal fixture in Task 5,
# with a started-state filter and all three scopes enabled.
scopes = pipeline_response["metrics"][0]["scopes"]
assert [scopes[key]["total"] for key in ("all", "open", "filtered")] == ["1001.00", "300.30", "200.20"]
```

```javascript
// Task 6: test_brl_beyond_safe_integer_keeps_cents
assert.equal(formatBRL("9007199254740992.01").replace(/\s/g, ""), "R$9.007.199.254.740.992,01");

// Task 7: test_peek_rejected_save_keeps_draft
// Enter 56,78 and have the fixture/API reject that save; fieldId is the currency field.
assert.equal(await page.getByTestId(`custom-field-${fieldId}-input`).inputValue(), "56,78");
assert.equal(await page.getByText("Permission denied", { exact: true }).isVisible(), true);

// Task 8: test_admin_field_is_available_only_in_its_project
assert.equal(fieldsInCrm.some((field) => field.name === "Opportunity value"), true);
assert.equal(fieldsInOtherProject.some((field) => field.name === "Opportunity value"), false);

// Task 9: test_saved_column_order_survives_reload
assert.deepEqual(reloadedView.custom_view.columns, [
  { kind: "builtin", key: "state" }, { kind: "custom", field_id: fieldId }
]);

// Task 10: test_old_filter_response_cannot_overwrite_latest_total
// Fulfill the current request with 2.00, then release an older request with 9.00.
assert.equal((await page.getByTestId(`pipeline-total-${fieldId}-filtered`).innerText()).replace(/\s/g, ""), "R$2,00");

// Task 11: test_real_application_has_all_entry_surfaces
// Reload an item created with a custom value and verify actual detail, peek,
// spreadsheet and saved-view routes, not just the shared component fixture.
assert.equal((await page.getByTestId(`custom-field-${fieldId}`).innerText()).includes("12,34"), true);
```

Task 12's `test_release_evidence_complete` is a checklist gate: assert the API/browser suites and type check exited zero, additive migrations were tested on the isolated database, source is clean, candidate images all exist, free disk is at least 25 GiB, and explicit rollout consent is recorded. Before those assertions pass, the production deploy command is not permitted.

## Plan self-review and execution handoff

Spec coverage: Tasks 2–3 own schemas/values/drafts/permissions; 6–8 own all editing/settings/history; 4/9 own saved configs and dynamic layouts; 5/10 own all/open/filtered/group sums and live correctness; 1/11/12 own bounded tests, regressions and rollout. Review Focus cases are assigned explicitly above. Existing unsupported move facilities are not invented; confirmation/clearing is enforced in the shared transfer helper and supported draft/copy/project-selection paths.

Checkpoints: after Task 5 (backend contracts and totals), after Task 10 (complete user-facing flow), and before Task 12 production deployment. Do not announce a partially implemented phase as the complete CRM feature.

The current harness exposes read/edit/bash tools, not native subagent dispatch. Native task-by-task execution in this session is available. For an independent whole-branch review, use a separate reviewer session; do not falsely label self-review as independent. Subagent-driven execution requires a harness/session with that capability.

**Awaiting user review of this plan and selection/confirmation of execution method. No implementation is authorized by writing this plan alone.**
