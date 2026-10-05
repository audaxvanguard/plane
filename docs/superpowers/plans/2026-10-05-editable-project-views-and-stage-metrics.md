# Editable Project Views and Stage Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native sequential execution is the available method; no subagent/reviewer tool is installed. Record self-review as self-review, not independent review.

**Goal:** Deliver editable project properties, saved mixed-column views, both stage sources and exact overall/per-stage metrics in Plane's real UI.

**Architecture:** Extend IssueView.custom_view rather than create a parallel view store. Backend validates versioned configuration and shares permission-filtered query/aggregate semantics; frontend holds saved and temporary configurations separately and reuses typed editors. Shared schema/state mutations and view-only presentation use distinct actions.

**Tech Stack:** Django/DRF, PostgreSQL decimal aggregates, React/TypeScript, MobX, React Hook Form, existing Plane UI, pytest and protected browser fixtures.

**Spec:** `docs/superpowers/specs/2026-10-05-editable-project-views-and-stage-metrics-design.md` (written specification approved by user).

## Global Constraints

- Project-scoped custom fields/views only; preserve legacy {} and version 1 without rewriting existing records.
- 32 KiB view configuration, 75 columns, 50 conditions/metrics, 50 active project fields, 100 select options; aliases at most 255 Unicode characters, trimmed/nonempty/escaped.
- Currency is exact BRL decimal strings, number precision unchanged; no Number/parseFloat/reduce aggregation. Unset differs from false and zero.
- Existing permissions/private/shared/locked rules remain authoritative; no automatic CRM fields/backfill or permission/license bypass.
- Preserve domain, SMTP, OmniRoute, optional timestamps/date-only behavior, uploads, existing data, AGPL notices, backups and rollback images.
- Protected shared 6 GiB/no-swap/1.5 CPU, serialized work, pressure guard, disk preflight >=25 GiB and compiler-only no-THP launcher; no limit/host-policy relaxation.
- Production remains deployed e76ea6e27531 until final protected rollout. Use existing isolated `/opt/plane-custom-fields` worktree and private test DB; never roundtrip fixtures against production.
- No formulas, averages, weighted sums, charts, relations, automations or cross-project schemas/totals. Original audit-history obligations remain separate.

## Review Focus

1. A nonempty view hides every populated stage: totals stay correct, hidden-item notice appears and Show hidden stages restores access (Tasks 1, 6, 7).
2. Remote saved-view reload while the local working config is dirty: local edits survive, no silent shared PATCH occurs and Discard explicitly restores the saved baseline (Task 3).
3. Removing a state concurrently with assignment of another item: expected-count mismatch/revalidation denies removal or includes the new item atomically; no dangling/deleted-state item (Task 5).
4. Shared property rename while a view has an alias, including emoji/255-character Unicode aliases: alias stays local, IDs/values remain stable and alias limits match frontend/backend (Tasks 1, 4).
5. Switching between an ordinary project, saved view and another project's cycle/module while metadata/totals are in flight: use actual project context and reject stale responses (Tasks 2, 3, 7).

---

## File and responsibility map

- Backend `plane/app/services/custom_view_config.py` (new): version-2 presentation validation/normalization; query functions stay in existing `custom_field_queries.py`.
- Backend `plane/app/services/project_stage_operations.py` (new): preview/transactional native-state replacement/removal, not unrelated state CRUD restructuring.
- Frontend `helpers/project-view-config.ts` (new): immutable conversion, column/stage identities, alias/selection resolution and query projection.
- Frontend `core/store/project/view-configuration.store.ts` (new): saved vs working configuration by workspace/project/view; explicit persistence actions.
- Frontend `core/store/project/view-metrics.store.ts` (new): keyed aggregate requests, generations, loading/error/invalidation only.
- Frontend `core/components/views/configuration/` (new): small columns/conditions/stages/metrics/toolbar components, not one monolithic editor.
- Existing services/stores/forms/layouts retain ownership of work-item/schema/state operations; add narrow adapters and typed props.

## Task 1: Version-2 configuration, stage references and count aggregates

**Files:** Create `apps/api/plane/app/services/custom_view_config.py`; modify `apps/api/plane/app/services/custom_field_queries.py`, `apps/api/plane/app/serializers/view.py`, `packages/types/src/custom-fields.ts`; test `apps/api/plane/tests/contract/app/test_custom_views_app.py`, `test_custom_field_aggregates_app.py` and new `apps/api/plane/tests/unit/serializers/test_custom_view_v2.py`.

**Interfaces:** Preserve `validate_custom_view(project, raw) -> dict` and `aggregate_custom_fields(*, user, project, config, builtin_filters, rich_filters, display_filters) -> dict`. Add `validate_view_presentation(project, raw) -> dict`. Frontend `TProjectCustomViewConfig` becomes a v1/v2 union. V2 columns add optional `alias`; v2 adds `stages: null | {source:'state'|'custom', field_id?:UUID, order:string[], hidden:string[], aliases:Record<string,string>}` and `count_scopes: TCustomMetricScope[]`. Native stage IDs are project state UUIDs plus reserved `None`; custom IDs are option UUIDs/`unset`, or checkbox `true`/`false`/`unset`. Native source requires display group `state`; custom source must match group_by.field_id.

Count-only responses add `counts: {scopes: Partial<Record<scope,{item_count:number}>>, groups:{key:string,label:string,scopes:Partial<Record<scope,{item_count:number}>>}[]}`. Existing numeric metrics and response keys remain unchanged. Presentation order/hidden/aliases do not change eligible sets or SQL filters. Version 1 cannot accept v2-only keys; {} remains {}.

- [ ] Write `test_v2_aliases_and_stage_ids_are_scoped`, `test_v1_and_empty_unchanged`, `test_unicode_alias_limit`, `test_count_only_empty_and_hidden_stages`, `test_presentation_never_filters_results`: assert foreign/duplicate IDs rejected, 255 emoji accepted/256 rejected, invalid/mismatched stage sources rejected, hidden populated stage still counted/summed, empty count zero and native None/custom unset retained.
- [ ] Run those tests with `python3 deployments/audax/run_custom_fields_tests.py api plane/tests/unit/serializers/test_custom_view_v2.py plane/tests/contract/app/test_custom_views_app.py plane/tests/contract/app/test_custom_field_aggregates_app.py -q`; observe failures before implementation. If test-image importer is pressure-blocked, use the existing locked candidate-image/private-tmpfs dependency approach, not unbounded compose or relaxed guards.
- [ ] Implement the declared union/validator and shared count aggregation over the same distinct eligible ID sets. No migration/backfill; persisted config is already JSON. Existing reference-access checks remain before request overrides.
- [ ] Rerun the targeted suite and existing scalar/view/aggregate regressions; require all pass.
- [ ] Commit `feat(api): validate view presentation and stage counts` after diff/self-review.

## Task 2: Real Exibir metadata/context and inline property management

**Files:** Modify `apps/web/core/hooks/use-project-custom-field-definitions.ts`, `core/components/issues/filters.tsx`, `core/components/issues/issue-layouts/filters/header/display-filters/{display-filters-selection,display-properties}.tsx`, `core/components/views/form.tsx`, project-view/cycle/module header callers discovered by tracing DisplayFiltersSelection; create `core/components/views/configuration/properties-manager.tsx`; reuse `core/components/project/settings/custom-fields/root.tsx`, `core/services/custom-field.service.ts`; update English/pt-BR `project-settings.json`. Test new `deployments/audax/test_view_properties_browser.mjs` and `view-properties-fixture.tsx`.

**Interfaces:** `useProjectCustomFieldDefinitions(slug?, projectId?) -> {fields,error,loading,retry}`; retry explicitly starts a new authorized metadata request. `ViewPropertiesManager({workspaceSlug,projectId,canManage,onDefinitionsChanged})` wraps existing schema editor/mutations. Display props accept explicit actual project context and optional `onManageProperties`; never treat view/cycle/module ID as project ID.

- [ ] Browser RED tests mount actual ProjectViewForm and the actual Exibir components: existing currency appears; schema GET failure shows Retry rather than No fields; cycling project/view/module context uses correct project endpoint; only schema-authorized actor sees Create/Manage; member values/view toggles still work. Assert one fetch per surface, not per card.
- [ ] Run `CF_CHROME=/docker/plane-ql3x/audax-deploy/test-chrome/chrome-test python3 deployments/audax/run_custom_fields_tests.py browser --fixture deployments/audax/test_view_properties_browser.mjs`; confirm regression failures.
- [ ] Implement explicit-context adapters and native manager, localized loading/error/empty states. Metadata mutation refreshes shared definitions without removing retained archived references. Do not modify global workspace/epic surfaces into cross-project custom views.
- [ ] Rerun browser suites for settings/store/native fields and the new real-form fixture; require pass.
- [ ] Commit `fix(web): show project properties on saved view surfaces`.

## Task 3: Effective working configuration, explicit save and typed filters

**Files:** Create `apps/web/helpers/project-view-config.ts`, `core/store/project/view-configuration.store.ts`, `core/hooks/use-view-configuration.ts`, `core/components/views/configuration/{toolbar,conditions}.tsx`; modify `core/store/root.store.ts`, `core/store/project-view.store.ts`, `core/store/issue/project-views/{filter,issue}.store.ts`, `core/services/view.service.ts`, `core/components/views/{form,modal}.tsx`, `core/components/issues/issue-layouts/roots/project-view-layout-root.tsx`, `packages/types/src/views.ts`; test new `deployments/audax/test_project_view_config.mjs`, `test_project_view_store_browser.mjs`.

**Interfaces:** `ViewConfigurationStore` methods `hydrate(context,saved)`, `change(context,patch)`, `discard(context)`, `save(context):Promise<IProjectView>`, `saveAs(context,name):Promise<IProjectView>`, `reset()`; context is `{workspaceSlug,projectId,viewId}` and saved/working state includes display_filters/display_properties/rich_filters/custom_view. `projectQueryConfig(working):TProjectCustomViewConfig|{}` produces the one effective config used for pagination and metrics. `columnKey(column):string` yields `builtin:<key>`/`custom:<uuid>`. No save call in change(). Hydrate updates baseline but never overwrites dirty working state without explicit discard.

- [ ] Write assertions: `change` causes zero PATCH calls; explicit Save sends complete v2 payload; failed save retains dirty config; two actors see only persisted config; private/locked/shared restrictions are enforced server-side; save-as/duplicate keeps aliases/conditions/stages/metrics under existing new-view access rules. Test switching context and late hydration; invalid references do not broaden queries.
- [ ] Run protected helper/browser RED tests and add backend saved-view permission roundtrips in `test_custom_views_app.py`.
- [ ] Implement immutable normalization and explicit persistence; wire ProjectViewForm submit including custom_view, service/store validation (avoid existing sanitizers stripping it), toolbar Unsaved/Save/Discard/Save as. Condition editor exposes only supported typed operators, AND semantics and paired comparisons for ranges. Issue requests carry effective override and authorized view_id before paging; layout changes preserve custom config. No silent shared write from filter actions.
- [ ] Rerun helper/store/permission tests; save/reload/duplicate must retain complete configuration.
- [ ] Commit `feat(web): separate temporary and saved view configuration`.

## Task 4: Mixed headers, aliases, ordered custom cards and spreadsheet cells

**Files:** Create `core/components/views/configuration/columns.tsx` and `core/components/issues/issue-layouts/spreadsheet/columns/custom-field-column.tsx`; modify `core/components/issues/issue-layouts/spreadsheet/{spreadsheet-view,spreadsheet-table,spreadsheet-header,spreadsheet-header-column,issue-row,issue-column}.tsx`, `core/components/issues/issue-layouts/properties/all-properties.tsx`, `helpers/project-view-config.ts`, relevant spreadsheet root props; test `deployments/audax/test_view_columns_browser.mjs` with actual SpreadsheetTable/header/row components.

**Interfaces:** `resolveViewColumns(config,metadata,featureFlags):TResolvedViewColumn[]` returns stable key, kind/reference, effective title, archived/readOnly flags. Name identity column remains available. `CustomFieldColumn({field,value,onSave,disabled})` uses existing CustomFieldEditor; onSave is a sparse `{custom_values:{[field.id]:scalar|null}}` through normal updateIssue plus authoritative refresh. View aliases are passed separately to card/chip display and never posted to schema endpoints.

- [ ] RED browser tests reorder builtin/custom columns and save/reload; view A alias is unchanged by shared property rename and view B uses new shared name; reset alias restores shared name; 255/256 Unicode alias parity; name column cannot disappear; bool false/currency zero/unset remain distinct. Failed inline save keeps entered value/error; viewer and archived cells remain read-only. Check feature-disabled builtin columns and empty table configuration controls.
- [ ] Run protected real spreadsheet fixture and helpers; confirm failures.
- [ ] Implement dynamic headers/rows/cells and native draggable column editor using existing pragmatic drag/drop. Retain builtin renderers and fallback legacy ordering; make empty tables configurable. All layouts use the same custom-property ordering/aliases.
- [ ] Rerun spreadsheet, native editor and saved-view store fixtures; require pass.
- [ ] Commit `feat(web): add editable custom view headers and table cells`.

## Task 5: Transactional native-state replacement with explicit preview

**Files:** Create `apps/api/plane/app/services/project_stage_operations.py`; modify `apps/api/plane/app/views/state/base.py`, `apps/api/plane/app/urls/state.py`, `apps/web/core/services/project/project-state.service.ts`; test new `apps/api/plane/tests/contract/app/test_state_replacement_app.py`.

**Interfaces:** `preview_state_replacement(*,user,project,state_id)->{item_count:int,referenced_view_ids:list[str]}` and `replace_and_delete_state(*,user,project,state_id,replacement_state_id,expected_item_count:int)->None`. Add authenticated project state `/<state_id>/replacement-preview/` GET and `/<state_id>/replace-and-delete/` POST body `{replacement_state_id,expected_item_count,confirmed:true}`. Retain original empty-state DELETE behavior. JS `previewStateReplacement(...)`/`replaceAndDeleteState(...)` use these endpoints.

- [ ] RED tests assert admin-only access, foreign/source==target rejection, default/triage restrictions, affected counts including archived/draft items, visible saved-view references, count-change/concurrent assignment protection and all-or-nothing failure. Transition preserves normal completed_at/state activity semantics; other item custom values/time companions stay unchanged. Removed-state view references are recoverable errors, not rewritten filters.
- [ ] Run protected API targeted suite before implementation.
- [ ] Implement transaction locks on project/source/target/items with post-lock reference/count revalidation. Reuse/refactor the existing issue state-transition logic for completed_at/history instead of raw FK update; schedule background work only after commit. Cover all remaining FK references before invoking guarded empty-state removal. Reuse existing role checks/caches, do not grant item writes to guests.
- [ ] Rerun state/value/time regressions and concurrency test; require no partial reassignment on injected failure.
- [ ] Commit `feat(api): safely replace an in-use project state`.

## Task 6: Shared stage editors, view presentation and safe board movement

**Files:** Create `core/components/views/configuration/{stages,state-removal}.tsx`; modify `core/components/project-states/root.tsx` only to extract/reuse native state controls as needed, `core/components/issues/issue-layouts/utils.tsx`, kanban `default.tsx` and headers `group-by-card.tsx`, list `default.tsx`, `core/store/issue/helpers/base-issues.store.ts`, `helpers/project-view-config.ts`; test `deployments/audax/test_view_stages_browser.mjs`.

**Interfaces:** `resolveViewStages(config,definitions,groupCounts)` returns ordered visible/hidden columns with title/color/payload/editability and hidden item count. View presentation edits call Task 3 change only. Shared edits call existing state/option services; removal uses Task 5 preview/confirmation. Move payload is `{state_id:uuid}` or `{custom_values:{[field_id]:optionUUID|boolean|null}}`, never arbitrary group annotation properties.

- [ ] RED actual-board tests for both sources: shared rename/color/order vs local alias/order/hide; hide every populated stage gives notice and Show hidden stages without changing totals/query conditions; unset remains accessible; active select/state moves succeed; retired/default/triage/guest forbidden actions are disabled or rejected; failed move restores old column. Confirmation displays count and referenced views; cancellation issues zero mutation calls.
- [ ] Run new protected stage browser suite and API state-replacement tests.
- [ ] Implement source selector, localized inline shared controls, view-only presentation controls and hidden-stage notice. Lift prior blanket custom-drag disable only for validated supported editable targets; retain permission/workflow/subgroup restrictions and rollback. Drop/refetch uses authoritative response and invalidation interface from Task 7.
- [ ] Rerun stages and existing native group/pagination helpers; require pass.
- [ ] Commit `feat(web): configure native and custom pipeline stages`.

## Task 7: Configurable exact total/count UI and invalidation

**Files:** Create `core/store/project/view-metrics.store.ts`, `core/hooks/use-view-metrics.ts`, `core/components/views/configuration/metrics.tsx`, `core/components/issues/issue-layouts/metrics/{totals,stage-totals}.tsx`; modify root store, CustomFieldService aggregate types, list/kanban/spreadsheet roots and group headers, normal mutation success paths; test new `deployments/audax/test_view_metrics_browser.mjs` and backend aggregate contract tests.

**Interfaces:** `ViewMetricsStore.fetch(context,effective):Promise<void>`, `invalidate(projectId):void`, `reset():void`; context contains workspace/project/view and effective configuration includes builtin/rich/display filters and custom_view. Request generations discard old context/results. Components consume server scopes/groups and decimal-string formatters; count selection uses count_scopes. No aggregation over loaded issue maps. Invalidation runs only after confirmed create/update/archive/delete/stage changes and on confirmed schema relevance changes; failed saves leave confirmed data intact.

- [ ] RED tests: all/open/filtered concurrently; currency/number/count-only choices; empty board; missing/zero/negative/large `9007199254740992.01`; results spanning pages; hidden stage totals; many-to-many overlap warning. Select option named Won with native started state still counts as open. Delayed response for previous view is discarded; failed mutation does not publish new totals; confirmed create/update/move/archive/delete/filter refreshes appropriate scope/groups.
- [ ] Run protected metrics browser and existing backend aggregate tests before implementation.
- [ ] Implement controls and visible totals above layouts even when empty, per-stage totals in headers, loading/error states that do not attribute stale values to a new config, contextual retry, stable `pipeline-total-<field_id>-<scope>` test IDs. Explain custom-stage open scope using native state groups.
- [ ] Rerun metrics/board/store fixtures and API aggregates; require matching server counts/sums.
- [ ] Commit `feat(web): show configurable overall and stage pipeline metrics`.

## Task 8: Full-stack acceptance, regression and protected deployment

**Files:** Create `deployments/audax/test_editable_views_app_browser.mjs` and private-stack orchestration fixture as necessary; extend existing protected harness, never upstream unbounded compose. Update private progress/checklists and release notes; production config is changed only by existing deploy.py.

**Interfaces:** Consume Tasks 1–7; no new product behavior. Authenticated compiled-app acceptance uses a disposable private test workspace/project and isolated DB, actual compiled web/API images, test-only credentials, bounded containers and serialized runs. Verify actual public portal exclusion separately. Do not pretend component mocks are full-app acceptance.

- [ ] Create failing acceptance flows through actual saved-view create/detail and Exibir: configure mixed columns/aliases, edit cells, both stage sources, save/reload/duplicate with second actor, hidden stages, metrics across pages, atomic stage removal, failed saves and context switches. Production records are not fixture targets.
- [ ] Execute protected full pytest plus helper/browser suites; run frontend `python3 deployments/audax/deploy.py check`, targeted OxLint/oxfmt for changed TS/TSX and `git diff --check`. Include 21 build-safety/7 deployment tests and harness regressions. Report warnings/failures explicitly. Use candidate-image test deps in private tmpfs if importer pressure blocks test-image creation.
- [ ] Self-review each completed task and full branch against spec/tests. Seek independent review only if a real tool/reviewer becomes available; record unavailability honestly. Validate config-v2 older-UI rollback behavior and provide explicit recovery notes without data/config deletion.
- [ ] With clean committed source, run `python3 deployments/audax/deploy.py build` under unchanged limits, then authenticated compiled-app suite against exact candidate. Require all relevant flows passing, not just served asset presence. Confirm >=25 GiB disk and preserved backups/rollback images before rollout.
- [ ] Push feature/production branches and deploy through `python3 deployments/audax/deploy.py deploy` (add `--allow-migrations` only if reviewed migrations actually change). Fresh DB/config/upload backup is mandatory. Verify health, served assets, login/view configurations/metrics and upload smoke per existing workflow. Any production disposable smoke records need explicit consent and cleanup; no automatic database downgrade on failure.
- [ ] Record exact revision, tests, backup and known remaining original-plan work. Only claim this increment complete after saved-view/column/stage/metrics acceptance, not the entire original CRM feature.

## Self-review and execution handoff

Spec sections 1/2/3/4/5/6 map to Tasks 2/4/5–6/3/7/1 respectively; verification/rollout map to Task 8. Every Review Focus case has a named test owner. Task 3 owns configuration projection consumed by Tasks 4/6/7, Task 1 owns backend wire contracts, Task 5 owns native removal service. No task assumes unsupported arbitrary formula or new permissions.

User has approved the written spec. This plan now requires review before implementation. Native sequential execution is the available approach; independent review is unavailable in this toolset. Existing original-plan tasks not covered here (notably complete durable custom-value audit history) remain separately tracked.
