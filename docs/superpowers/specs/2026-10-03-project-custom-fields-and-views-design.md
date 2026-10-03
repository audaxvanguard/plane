# Project custom fields and saved CRM views

Status: proposed design; awaiting review of this written specification before implementation planning.

## Purpose and approved requirements

Plane is used as a CRM. Users need configurable item properties, notably opportunity value, rather than a fixed issue schema. Each project defines its own fields; project admins manage definitions, and those fields are available on every item in that project. Views must be customizable and saved. All monetary fields and totals use BRL.

The user approved custom fields and custom saved views, including all three pipeline-total choices: all opportunities, open opportunities and the current filtered view. This extends the existing self-hosted fork, not a separate CRM application or a license bypass.

No fields are automatically added to existing projects. Admins can create a BRL currency field named “Opportunity value” in the CRM project. Existing work items remain valid without any custom values.

## Approach

Use reusable typed field definitions and values, integrated with Plane's existing project views, issue permissions and layouts.

Alternatives considered:
- A hard-coded CRM amount on every issue: simpler, but does not deliver project-customizable dimensions.
- An unvalidated JSON bag on issues: quick to add, but weak for validation, indexed sorting, decimal-safe totals and permission enforcement.
- Typed project definitions and values: more initial integration work, but supports extensibility and reliable reports. Recommended and selected.

The feature has two connected increments: custom field definitions/editors, then saved-view customization and reporting. Both must pass acceptance tests before the approved feature is considered complete. Intermediate checkpoints are not a complete CRM release.

## First-release scope

### Field types

- Text: plain text, maximum 2,000 characters.
- Number: signed decimal, maximum 24 digits including 6 fractional digits; reject excess precision rather than silently round.
- Currency: signed BRL decimal, maximum 18 digits including 2 fractional digits; reject excess precision. Signed values allow adjustments/credits; this is not a positive-only opportunity-specific model.
- Date: calendar date without mandatory time; existing issue schedule fields remain unchanged.
- Checkbox: true/false, distinguishable from an unset field.
- Single select: one option with a stable ID and editable label/color.

Fields are optional. Blank means unset, not zero or false. No arbitrary expressions, computed formulas, multi-select, relations, rollups across projects, automation, charts or currency conversion in this release. Numbers may represent probabilities, but there is no percentage-specific or weighted-pipeline formula yet.

### Field administration

Project settings gains a Custom fields section. Project admins can create, rename, describe, reorder, archive and restore fields, and manage select options. Field names are unique within a project after whitespace/case normalization; names are presentation only, never identifiers in requests or saved filters.

Field types are immutable after creation, avoiding silent data conversions. To change a type, create another field. Select-option IDs survive label edits; options with existing values may be retired, not destroyed. A retired option remains visible on existing values but cannot be newly assigned.

Archiving preserves values and audit history. Archived fields are hidden from new-entry forms and new view-field selections. Existing saved views referencing them retain read-only values and an archived-field indicator; do not silently discard filters or broaden results. Restoring makes them editable again. No hard-delete UI in the initial release.

### Editing surfaces

Custom values are editable in:
- Item creation and update dialogs.
- Full item details.
- Quick-view/peek panel.
- Spreadsheet cells.

Selected custom properties appear on list rows and Kanban cards. Reuse a shared typed editor across surfaces. Show field descriptions, BRL formatting and field-level validation errors. Failed saves preserve the user's input and expose the error; optimistic rollback must not dismiss editors.

Drafts retain custom values and validate them on save and promotion. Atomic item creation/update prevents a created item with a silently failed value save. Quick-add may create an item with no optional custom values, then expose normal editors; it must not invent defaults.

Changing a draft's project clears incompatible custom values only after a visible warning/confirmation. Moving an existing item with values requires confirmation that its project-specific values will be cleared from the active item; log the change in item history. There is no implicit name-based mapping to destination fields. Same-project duplication may preserve values; cross-project copying does not reuse source field IDs.

## Saved views and customization

Extend existing project IssueView records rather than invent a second saved-view store. Existing view filters, privacy/sharing, ownership, locking and permissions remain authoritative.

Custom-field support is project-scoped in this release. Existing workspace-wide views continue to work unchanged, but do not match similarly named fields across projects or offer cross-project custom-field totals.

Each project view can save:
- Existing layout selection; custom-field rendering applies to list, Kanban and spreadsheet.
- Ordered visible properties/columns, including built-in and custom fields.
- Built-in filters plus custom-field conditions.
- A custom-field sort, ascending or descending, with a stable item-ID tie-breaker and unset values last in both directions.
- Grouping by an existing supported property, a custom single-select field, or a custom checkbox field. Do not bucket arbitrary numeric/currency/text values automatically.
- Selected numeric/currency sum metrics and enabled total scopes (all, open, filtered); multiple scopes may be displayed together.

Spreadsheet supports actual draggable/reorderable columns and inline typed editing. Lists/Kanban use the same saved property order for their custom-property display, not a new table UI. Existing calendar/timeline behavior remains date-based; custom dates do not become scheduling fields in this release.

Support creating, editing and duplicating saved views using existing view permission rules. Ordinary users may use temporary view changes or their permitted private views; changing a shared/locked view must honor current authorization. Never persist every viewer's temporary changes into a shared view automatically. UI distinguishes unsaved changes from saved settings.

### Custom filters

Typed filter definitions reference stable field IDs and option IDs. Backend whitelists fields/operators and validates operand types; never accept SQL fragments, arbitrary model paths or unrestricted JSON lookup strings.

- Text: equals, contains, is set, is unset.
- Number/currency: equals, greater than, less than, inclusive range, is set, is unset.
- Date: equals, before, after, inclusive range, is set, is unset.
- Checkbox: true, false, is set, is unset.
- Single select: is one of, is not one of, is set, is unset.

“Is not one of” applies only to set values; unset values are included explicitly with an unset condition. Custom conditions are combined with AND in the first release, and ANDed with existing built-in filters. The UI must make that limitation clear; no unsupported custom OR expression builder.

Pagination, grouping, sorting and aggregate queries use the same validated custom-filter semantics. Saved views must retain their complete custom configuration across reloads and users entitled to see that view.

## Pipeline and numeric totals

An admin creates a currency field, e.g. Opportunity value. A view chooses that field as a sum metric; other number/currency fields can also be selected. Totals are computed, not editable values copied onto each item.

For each chosen field:
- **All opportunities**: all eligible items in the project, ignoring the current view's item filters.
- **Open opportunities**: the same eligible set, excluding states in the completed/cancelled groups. Use stable state groups, not translated labels like Won/Lost. Custom CRM won/lost states must be assigned to those groups for this classification.
- **Filtered opportunities**: the complete result matching current built-in and custom view filters, not only the loaded page or visible cards.

Eligible means the caller can read the project/items and the item is neither deleted, archived nor a draft. Honor the view's sub-item inclusion setting for all scopes. If sub-items are included, each eligible item is summed once; do not add a parent rollup and then add its children again.

Display the selected scopes as distinct labelled totals above the layout. For a grouped view, show totals per group for each selected scope. Group totals use the relevant scope's item set plus group membership. Existing many-to-many groups may include an item in multiple groups, so group subtotals need not sum to the overall total; the overall sum must deduplicate issue IDs. Expose a “may overlap” explanation for those groupings.

Unset values contribute nothing to the sum. Return item count, valued-item count and missing-value count so a misleading zero can be distinguished from no entered values. An empty sum is BRL R$ 0,00 with the accompanying counts. Negative entered amounts decrease the total.

Backend uses PostgreSQL/Django decimal aggregates over typed values. Monetary API values and totals are decimal strings; no binary floating-point storage/calculation. Frontend performs decimal-safe parsing and formatting as pt-BR BRL (for example R$ 12.345,67), including totals beyond JavaScript's safe integer range. Numeric sums preserve the field's precision and are not displayed with a currency symbol.

Edits to amount, status or relevant filter/group properties invalidate and refresh affected totals. Report updates happen after confirmed API success; failures do not leave apparently saved totals. Aggregation must use permission-filtered querysets and never leak other projects or private-view results.

## Data and API design

Proposed additive models:
- ProjectCustomField: project/workspace ownership, UUID, name, description, type, order and archived flag.
- ProjectCustomFieldOption: field UUID, stable option UUID, label/color, order and retired flag.
- IssueCustomFieldValue: issue UUID, field UUID and typed text/decimal/date/boolean/option columns. Unique issue/field; check constraints ensure exactly the column allowed by its field type is used. Application validation verifies field type and matching project/workspace (cross-table rules cannot be expressed with a simple SQL CHECK).
- Draft custom values: validated JSON keyed by field UUID on DraftIssue; create typed issue values during promotion in the same transaction.

Field/option metadata APIs are scoped to the existing workspace/project routes and roles. Issue serializers accept a custom_values mapping keyed by field UUID. Omitted entries remain unchanged on PATCH; explicit null clears an entry. Reject unknown, archived-for-editing, foreign-project or incorrectly typed values. Set limits: at most 50 active fields per project and 100 options per select field; no unlimited user-generated columns.

Return field metadata in a project-scoped payload, not repeated on every issue row. Return authorized custom values in creation/detail/list responses, prefetching as appropriate to avoid one query per field/item. Validate all create, edit, draft, promotion, duplicate and move paths consistently.

Saved-view additions live in explicit validated configuration, alongside existing built-in properties and filters. Preserve unknown legacy/default display settings; legacy views without custom configuration use existing behavior. Integrate the new configuration with the existing filters/query builders instead of trusting a saved client-supplied query object.

Aggregate API accepts a validated view/filter configuration and selected field IDs/scopes. Share the item-query construction with list endpoints. Index issue/field uniqueness and field/typed-value lookups used for filtering/sorting. Avoid joining multiple value rows or label rows in a way that multiplies sums.

Custom-value changes appear in normal item activity with a readable field name and typed previous/new values. Retain a name/type snapshot for history so renaming/archiving definitions does not make old activity unreadable. Do not duplicate the whole issue audit subsystem.

## Permissions and safety

- Field administration: project admin only, checked server-side.
- Value editing: existing permission to edit the associated item; viewers/guests receive no new write permission.
- Field visibility and aggregates: no new access beyond existing project/item permissions.
- Saved views: retain existing private/public, owner/admin and locked-view rules.
- Permission tests cover attempted cross-workspace/project field/option access and guessed IDs.
- No backfill of existing items, automatic schema changes chosen by ordinary editors, production secrets in the public fork, or changes to OmniRoute, SMTP, schedules or uploads.

## Verification and rollout

Write failing tests before implementation. Verify:
1. Optional fields leave existing items and views unchanged.
2. Every type accepts correct input and rejects wrong type, precision overflow, bad options and foreign field IDs.
3. Clearing, renaming, option retirement and archive/restore preserve intended semantics and history.
4. Admin/viewer/editor/private-view/locked-view permissions, including cross-project attacks.
5. Create/update, drafts/promote, detail, peek, spreadsheet editing and failed-save retry preserve values correctly.
6. Saved columns/order, filters, sorting, grouping, metrics and reload/share/private behavior.
7. All/open/filtered totals, empty/unset/zero/negative values, large decimals, completed/cancelled states, sub-items and overlapping groups.
8. Totals match all matching results across pagination and update after amount/status edits.
9. Isolated PostgreSQL migrations and round trips; query-count checks on representative issue lists.
10. Actual browser tests of all entry/edit surfaces, configurable saved views and aggregate displays; backend tests and frontend type/lint checks.

Use the existing protected build workflow: 6 GiB shared RAM, zero build swap, 1.5 CPUs, serialized builds/checks, memory-pressure guard and disk-space preflight. No uncapped test or installer containers. Small test stacks must use bounded resources and isolated databases; never run roundtrip fixtures against production data.

Before deployment, review additive migrations, take the existing backup, migrate and verify health. Recheck disk space and signed image uploads. Do not claim completion until the real UI and aggregate behavior are verified. No automatic database downgrade on failed deployment. Preserve production backups and compatible rollback images.

## Review request

Please review the scope and defaults above before implementation planning. Particularly visible constraints are: opt-in optional fields, project-scoped saved custom views, BRL only, AND custom filters, immutable field types, supported select/checkbox grouping, and explicit clearing confirmation when moving to another project's schema.
