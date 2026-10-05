# Editable project views and stage metrics

Status: conversational scope approved; written specification awaiting user review. Product implementation must follow written-spec and implementation-plan review.

## Intent and relationship to existing work

The user wants Notion-style database/view customization inside Plane: custom properties visible in Exibir, freely configurable displayed headers and columns, editable stages using both project states and custom select fields, and configurable per-stage pipeline metrics. Extend the installed application rather than introduce another database product or remove access controls.

This supplements `2026-10-03-project-custom-fields-and-views-design.md` and its approved implementation plan. That feature remains incomplete. The deployed baseline is e76ea6e27531: typed project fields, native editors, normal project display controls and card values, creation/draft values, and backend saved-view/filter/aggregate foundations. This increment completes the relevant saved-view/table/reporting paths and adds view-specific header aliases and stage presentation.

### Process checklist

- [x] Inspect current display controls, view form/filter store, spreadsheet and configuration validator.
- [x] Receive approval of the conversational scope, including both stage sources.
- [x] Write this specification and self-review for consistency and safety.
- [ ] User reviews written specification.
- [ ] Write detailed implementation plan; user reviews and chooses sequential execution (no subagent tool available).
- [ ] Implement with failing tests first, verify real app flows, build and deploy safely.

## Existing gaps established by inspection

`ProjectWorkItemHeader` supplies project custom-field metadata to display controls. `ProjectViewForm` currently supplies neither metadata nor saved custom_view in its submit payload. The saved-view filter store and other display surfaces need explicit project context and configuration integration; a project-only header fixture cannot prove these routes work. Investigate the reported screenshot against these real paths, without assuming a missing project field definition or a stale client.

Spreadsheet currently renders a static SPREADSHEET_PROPERTY_LIST; custom columns and editors are not integrated. Backend custom_view version 1 validates field references, conditions, custom sort/group and numeric sum selections; it does not support header aliases or view-specific stage presentation. Exact aggregate services exist but the configurable totals/header UI is unfinished.

## Selected approach

Use existing IssueView records, project field definitions, project State records, option records, item services and permission rules. Add native editors and one authoritative saved-view configuration pipeline, not a parallel CRM/view store.

A separate Notion-like database subsystem would duplicate records and permissions. A hard-coded CRM board would limit customization. Extending existing views is selected because it keeps existing work items, workflows and integrations intact.

## 1. Exibir and property management

Every project-scoped work-item surface and saved project view resolves the actual project ID, independently of whether its entity ID is a project, view, cycle or module. Metadata loads once per relevant surface, never once per card. Workspace-wide views remain unchanged and do not combine similarly named fields across projects.

Exibir offers built-in and project custom properties, with visible loading/error/empty states. Metadata errors must not masquerade as a project having no fields. Selected archived properties remain visible with an archived indicator; new selections exclude archived definitions.

Owners/admins who already have schema permission can open Create property and Manage properties from Exibir. Reuse native schema controls and the existing endpoints. Other users retain permitted view customization and value editing, without gaining field-definition write access. Naming a property is not an identifier change.

## 2. Headers, columns and editing

Views select an ordered mixture of built-in/custom columns. Add, hide, show, drag-reorder and reset a header alias. A header alias changes only the view's displayed title, not its field definition or any other view. A separate clearly marked Rename property action changes the shared project definition and requires schema permission. Header aliases are plain escaped text, trimmed, nonempty, and at most 255 Unicode characters; identifiers remain stable.

The work-item identity/name column remains available so a view cannot become an inaccessible empty grid. Existing built-in column feature flags and edit permissions remain authoritative. Columns omitted from a view are not deleted from items.

Spreadsheet renders actual dynamic headers and inline typed cells using the shared editors, including false/unset and zero/unset distinctions. Failed saves preserve input and errors. Existing archived/retired values remain readable; they cannot become new assignments. List and Kanban use the same selected custom-property order and view aliases for display, without inventing a separate property model.

## 3. Both stage sources

A board can group by native project states or a project custom single-select field; existing checkbox grouping remains supported. Stage source is explicit in view settings. A select field is project-scoped, even if multiple views use it; item stage values are not separate per-view records.

Shared stage management:
- Native states: create, rename, recolor and reorder through existing state services. Retain state groups (backlog/unstarted/started/completed/cancelled), default-state rules and triage restrictions. Changing a state's group is explicitly shown because it changes open/closed reporting throughout the project.
- Custom select stages: create, rename, recolor, reorder and retire/restore options through existing field services. Retiring preserves existing values; no assignment to a retired option is allowed.
- Removing a native state with items is not an implicit delete. Require an explicitly selected valid replacement, visible affected count and confirmation, and permission-checked transactional reassignment before using the existing empty-state delete rules. Existing default/triage restrictions still apply. Surface saved-view references in the confirmation; do not silently rewrite other views or filters. Views retaining a removed stage reference expose a recoverable stale-reference error. Failure must leave items unchanged. No automatic removal or migration of existing stages.

View-only stage presentation:
- Reorder, hide/show and set/reset display aliases for stage headers without changing shared definitions or item values.
- Hidden stages are presentation, not an implicit item filter. Display a hidden-stage/item notice and Show hidden stages action. Overall metrics still include eligible hidden-stage items; excluding stages uses explicit filters.
- Unset custom-select values have an explicit group. New items must not receive invented defaults.

Drag between editable state or active-select groups changes the underlying state/value through the normal item update service. Drops to retired/read-only targets are disabled. Permission denial or failed save restores the previous position/value and exposes the error. Moving a card also refreshes both affected stage metrics.

## 4. Saved views, filters and permissions

Create, edit, save, reset and duplicate project views with their complete columns/order/aliases, built-in/custom filters, sorting, grouping, stage presentation and metric selections. The same configuration drives the list request, pagination and aggregate request. Built-in rich filters and custom conditions are ANDed; do not present an unsupported OR builder.

Temporary changes are local until explicitly saved. Show an Unsaved changes indicator and Save / Discard / Save as new view actions. Do not patch a shared view merely because someone toggles a display option. Shared/private/owner/admin/locked-view rules remain authoritative; unauthorized users can use supported temporary changes or create a permitted private copy, not overwrite the shared definition. Save failure retains the working configuration. Duplicate preserves settings but follows existing ownership/access rules for the new view.

Switching layouts, projects or views discards/guards outdated requests and uses the new context, never a stale field cache or another project's configuration. A stale/missing reference must produce an explicit recoverable error, not silently broaden the filter or drop a saved metric.

## 5. Stage metrics

Choose one or more currency/number fields for sums, and optionally show item counts. Support the already approved all/open/filtered scopes together:
- All: all eligible readable items in the project, ignoring current item filters.
- Open: eligible items excluding completed/cancelled native state groups.
- Filtered: all results matching the effective view filters, not the loaded page.

Each enabled scope displays distinct overall and per-stage totals. Count uses the same scope and stage membership. Numeric metrics include item, valued and missing counts so zero differs from missing data. For single-select stages, open classification still uses the item's native state group, not guessed option labels; state this beside the scope control. Weighted values, formulas, averages, charts and currency conversion are outside this increment.

Reuse server decimal aggregation over distinct eligible item IDs. Monetary values remain exact decimal strings and format as pt-BR BRL; no Number/parseFloat/reduce accumulation. Exclude deleted/archived/draft items, respect permissions and sub-item inclusion, and preserve existing overlap warnings for many-to-many grouping. Hidden stages must not alter scope eligibility. Empty boards still show enabled zero totals and counts.

After confirmed amount/state/stage/archive/delete/create changes, invalidate the relevant issue query and totals. Also refresh on filters, stage source, scope or metric selection changes. Reject stale responses using context/generation keys. Loading and failure states cannot show an old view's totals as current; failed mutations retain the last confirmed data and unsaved editor input.

## 6. Configuration and backend boundaries

Extend the existing JSON-backed IssueView.custom_view with an explicitly validated version 2 for optional header aliases and stage presentation. Continue reading legacy {} and version 1 without rewriting existing records. Upgrade a version-1 view only on an explicit save that needs the new schema; never migrate field values as part of configuration changes.

Version 2 retains stable field/option IDs and existing conditions/sort/metric semantics, adding bounded view aliases and ordered/hidden stage references for the selected stage source. Validate state IDs against the actual project and option IDs against the selected field, including retired references for read-only historic presentation. Count selection requires no fake numeric field. Built-in grouping stays aligned with native display settings, without contradictory stage source/group configuration. Resolve one effective internal configuration for querying and reporting.

Keep existing bounds: 32 KiB view configuration, 75 columns, 50 conditions/metrics, 50 active project fields, 100 select options. Bound aliases by their referenced column/stage sets; reject unknown keys, duplicates, foreign IDs and unsupported versions. Field types remain immutable in this increment; replacing a field must not silently convert or delete its historical values.

Backend project list/saved-view routes, per-group pagination and aggregate endpoints must use the same effective custom configuration and existing permission-filtered issue queryset. No raw SQL/model paths from user configuration. Workspace saved views cannot store project-specific custom configuration. Public portal responses continue excluding custom values and definitions.

## Verification and acceptance

Write failing tests before product changes. Required acceptance uses the actual project header, saved-view form/detail and spreadsheet—not only standalone typed editors.

1. The reported Exibir section lists existing custom fields on project and saved-view surfaces; loading/error/no-fields and project switching are correct.
2. Create/manage properties obey admin permission; other users can use allowed view/value operations. Foreign field/state/option/view IDs are denied.
3. Add/hide/reorder/alias built-in/custom headers; inline edit every supported type, including false, zero, null, invalid precision and failed-save retention. Changes survive save/reload/duplicate.
4. Both native/custom-select stages support permitted shared edits and independent view presentation. Shared rename propagates; a view alias/order does not affect another view. Native in-use removal requires explicit reassignment; failure is atomic. Retired/unset/default/triage and forbidden drop behavior are verified.
5. A second authorized viewer never receives another viewer's temporary configuration. Private/locked/shared save and duplicate behavior is tested.
6. Overall and stage all/open/filtered sums/counts match eligible results across multiple pages and hidden stages, including no items, missing/zero/negative/large exact decimals. A custom select labelled Won does not change open classification unless the native state is completed/cancelled.
7. Create/edit/move/archive/delete/filter changes refresh confirmed totals; delayed prior-view responses cannot overwrite them.
8. Legacy {} and version 1 remain readable; malformed/version-2/foreign references fail without losing existing definitions, values or saved filters.
9. Run bounded full backend regression, helpers/browser checks, frontend types and targeted lint. Document independent-review availability honestly. Authenticated compiled-app acceptance is required before claiming these UI flows complete.

## Rollout and non-goals

Keep production on the deployed baseline during implementation. Use the existing isolated feature worktree and private test database. Preserve domain, SMTP, OmniRoute, optional timestamps/date-only behavior, uploads, existing data, AGPL notices, backups and rollback images. No automatic CRM fields or backfill; no permission bypass or license unlock.

All builds/checks use the protected shared 6 GiB/no-swap/1.5 CPU slice, serialized compiler work, pressure guard, disk preflight >=25 GiB and compiler-only no-THP launcher. Do not relax limits or host policy. Deployment requires a fresh backup, explicit migration review where needed, health checks and verified served assets. Configuration version 2 may need view settings reset/forward-compatible handling when using an older UI; do not automatically downgrade databases or discard saved configurations to roll back.

This does not add Notion document blocks, relations/rollups, formulas, automation, cross-project schemas/totals or paid-feature unlocking. Original custom-field audit-history and other unresolved original-plan obligations remain tracked separately; this increment must not be represented as completing those obligations without verification.
