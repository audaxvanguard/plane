# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from uuid import UUID
from datetime import date
from decimal import Decimal
import re
from django.db import transaction
from rest_framework.exceptions import ValidationError, PermissionDenied
from plane.app.permissions import ROLE
from plane.db.models import (
    Project,
    ProjectMember,
    WorkspaceMember,
    Issue,
    DraftIssue,
    ProjectCustomField,
    IssueCustomFieldValue,
)


def resolve_fields(project_id, ids, *, for_write):
    try:
        normalized = {UUID(str(value)) for value in ids}
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"custom_values": "Invalid field identifier."})
    fields = {
        field.id: field
        for field in ProjectCustomField.objects.filter(
            project_id=project_id, id__in=normalized
        ).prefetch_related("options")
    }
    if set(fields) != normalized:
        raise ValidationError(
            {"custom_values": "Unknown or inaccessible custom field."}
        )
    if for_write and any(field.is_archived for field in fields.values()):
        raise ValidationError({"custom_values": "Archived fields cannot be edited."})
    return fields


def validate_scalar(field, raw):
    """Return canonical JSON-safe scalars, never accepting binary floats."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if field.type == "checkbox":
        if type(raw) is not bool:
            raise ValidationError("Checkbox values must be booleans or null.")
        return raw
    if not isinstance(raw, str):
        raise ValidationError(
            "Custom values must be strings, booleans, or null according to field type."
        )
    if field.type == "text":
        if len(raw) > 2000:
            raise ValidationError("Text values may have at most 2,000 characters.")
        try:
            raw.encode("utf-8")
        except UnicodeEncodeError:
            raise ValidationError("Text must contain valid Unicode.")
        return raw
    value = raw.strip()
    if field.type in ("number", "currency"):
        scale = 2 if field.type == "currency" else 6
        whole_limit = 16 if field.type == "currency" else 18
        match = re.fullmatch(r"[+-]?([0-9]+)(?:\.([0-9]+))?", value)
        if (
            not match
            or len(match[1].lstrip("0") or "0") > whole_limit
            or len(match[2] or "") > scale
        ):
            raise ValidationError(f"Invalid {field.type} precision or range.")
        parsed = Decimal(value)
        if parsed == 0:
            parsed = Decimal(0)
        if field.type == "currency":
            return format(parsed, ".2f")
        formatted = format(parsed, "f")
        return formatted.rstrip("0").rstrip(".") if "." in formatted else formatted
    if field.type == "date":
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValidationError("Dates must be YYYY-MM-DD.")
        try:
            return date.fromisoformat(value).isoformat()
        except ValueError:
            raise ValidationError("Invalid calendar date.")
    if field.type == "select":
        try:
            option_id = UUID(value)
        except (ValueError, TypeError, AttributeError):
            raise ValidationError("Invalid option identifier.")
        option = next(
            (item for item in field.options.all() if item.id == option_id), None
        )
        if option is None or option.is_retired:
            raise ValidationError("Unknown, inaccessible, or retired option.")
        return str(option.id)
    raise ValidationError("Unsupported custom field type.")


def normalize_patch(patch):
    if not isinstance(patch, dict):
        raise ValidationError(
            {"custom_values": "Expected a field identifier to value mapping."}
        )
    try:
        return {str(UUID(str(key))): value for key, value in patch.items()}
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"custom_values": "Invalid field identifier."})


def assert_value_access(project, actor):
    if actor is None or not actor.is_authenticated:
        raise PermissionDenied("Authentication is required to edit custom values.")
    workspace_role = (
        WorkspaceMember.objects.filter(
            workspace_id=project.workspace_id, member=actor, is_active=True
        )
        .values_list("role", flat=True)
        .first()
    )
    project_role = (
        ProjectMember.objects.filter(project=project, member=actor, is_active=True)
        .values_list("role", flat=True)
        .first()
    )
    if (
        workspace_role is None
        or project_role is None
        or (project_role < ROLE.MEMBER.value and workspace_role != ROLE.ADMIN.value)
    ):
        raise PermissionDenied("You cannot edit custom values in this project.")


def stored_scalar(value):
    kind = value.field.type
    if kind == "currency":
        return format(value.decimal_value, ".2f")
    if kind == "number":
        formatted = format(value.decimal_value, "f")
        return formatted.rstrip("0").rstrip(".") if "." in formatted else formatted
    if kind == "date":
        return value.date_value.isoformat()
    if kind == "checkbox":
        return value.boolean_value
    if kind == "select":
        return str(value.option_id)
    return value.text_value


def value_rows(issue):
    if issue._state.adding:
        return []
    if "custom_field_values" in getattr(issue, "_prefetched_objects_cache", {}):
        return list(issue.custom_field_values.all())
    return list(issue.custom_field_values.select_related("field", "option"))


def serialize_custom_values(issue):
    return {str(value.field_id): stored_scalar(value) for value in value_rows(issue)}


def snapshot(field, scalar):
    result = {"label": field.name, "type": field.type, "value": scalar}
    if field.type == "select" and scalar is not None:
        option = next(
            (item for item in field.options.all() if str(item.id) == scalar), None
        )
        result["option_label"] = option.label if option else None
    return result


def change_snapshot(field, before, after):
    return {
        "field": f"custom_field:{field.id}",
        "old_value": snapshot(field, before),
        "new_value": snapshot(field, after),
    }


def validate_historical_scalar(field, raw, baseline):
    """Preserve a saved retired option, never create a new retired assignment."""
    if field.type == "select" and raw is not None and raw == baseline:
        try:
            option_id = UUID(str(raw))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError("Invalid stored option identifier.")
        if any(option.id == option_id for option in field.options.all()):
            return str(option_id)
        raise ValidationError("Unknown or inaccessible stored option.")
    return validate_scalar(field, raw)


def persist_values(issue, fields, normalized, existing):
    changes = []
    columns = {
        "text": "text_value",
        "number": "decimal_value",
        "currency": "decimal_value",
        "date": "date_value",
        "checkbox": "boolean_value",
        "select": "option_id",
    }
    for key, scalar in normalized.items():
        field = fields[UUID(key)]
        row = existing.get(key)
        before = stored_scalar(row) if row else None
        if scalar == before:
            continue
        if scalar is None:
            if row:
                IssueCustomFieldValue.objects.filter(id=row.id).delete(soft=False)
        else:
            defaults = {column: None for column in set(columns.values())}
            defaults[columns[field.type]] = scalar
            defaults.update(project=issue.project, workspace_id=issue.workspace_id)
            IssueCustomFieldValue.objects.update_or_create(
                issue=issue, field=field, defaults=defaults
            )
        changes.append(change_snapshot(field, before, scalar))
    getattr(issue, "_prefetched_objects_cache", {}).pop("custom_field_values", None)
    return changes


@transaction.atomic
def apply_custom_values(issue, patch, *, actor):
    project = Project.objects.select_for_update().get(id=issue.project_id)
    assert_value_access(project, actor)
    Issue.objects.select_for_update().get(id=issue.id)
    patch = normalize_patch(patch)
    fields = resolve_fields(project.id, list(patch), for_write=True)
    existing = {str(row.field_id): row for row in value_rows(issue)}
    normalized = {
        key: validate_historical_scalar(
            fields[UUID(key)],
            raw,
            stored_scalar(existing[key]) if key in existing else None,
        )
        for key, raw in patch.items()
    }
    return persist_values(issue, fields, normalized, existing)


def validate_draft_values(project, patch, existing):
    patch = normalize_patch(patch)
    existing = normalize_patch(existing)
    if project is None:
        if patch or existing:
            raise ValidationError({"custom_values": "Custom values require a project."})
        return {}
    fields = resolve_fields(
        project.id, list(set(patch) | set(existing)), for_write=False
    )
    result = {}
    for key in set(patch) | set(existing):
        field = fields[UUID(key)]
        raw = patch.get(key, existing.get(key))
        baseline = existing.get(key)
        if field.is_archived and (key not in existing or raw != baseline):
            raise ValidationError(
                {"custom_values": "Archived fields cannot be edited."}
            )
        scalar = validate_historical_scalar(field, raw, baseline)
        if scalar is not None:
            result[key] = scalar
    return result


@transaction.atomic
def clear_project_values(issue, *, actor, confirmed):
    if not confirmed:
        raise ValidationError("Confirm clearing custom values before changing project.")
    project = Project.objects.select_for_update().get(id=issue.project_id)
    assert_value_access(project, actor)
    Issue.objects.select_for_update().get(id=issue.id)
    existing = {str(row.field_id): row for row in value_rows(issue)}
    fields = resolve_fields(project.id, list(existing), for_write=False)
    return persist_values(issue, fields, {key: None for key in existing}, existing)


@transaction.atomic
def promote_draft_values(draft, issue, *, actor):
    if draft.project_id != issue.project_id:
        raise ValidationError(
            "Draft and promoted item must belong to the same project."
        )
    project = Project.objects.select_for_update().get(id=issue.project_id)
    assert_value_access(project, actor)
    authoritative = DraftIssue.objects.select_for_update().get(id=draft.id)
    if authoritative.project_id != issue.project_id:
        raise ValidationError("Draft project changed before promotion.")
    Issue.objects.select_for_update().get(id=issue.id)
    normalized = validate_draft_values(project, {}, authoritative.custom_values)
    fields = resolve_fields(project.id, list(normalized), for_write=False)
    existing = {str(row.field_id): row for row in value_rows(issue)}
    changes = persist_values(issue, fields, normalized, existing)
    issue._custom_field_changes = changes
