# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded view-only presentation. Never converts presentation into item filters."""
from uuid import UUID
from rest_framework.exceptions import ValidationError
from plane.db.models import State
from .custom_fields import resolve_fields


def reject(message):
    raise ValidationError({"custom_view": message})


def validate_alias(value):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 255:
        reject("Header aliases require 1–255 Unicode characters.")
    return value.strip()


def validate_view_presentation(project, raw):
    for column in raw["columns"]:
        if "alias" in column:
            column["alias"] = validate_alias(column["alias"])
    scopes = raw.get("count_scopes", [])
    if (not isinstance(scopes, list) or len(scopes) > 3
            or any(not isinstance(scope, str) or scope not in ("all", "open", "filtered") for scope in scopes)
            or len(set(scopes)) != len(scopes)):
        reject("Invalid count scopes.")
    raw["count_scopes"] = scopes
    stages = raw.get("stages")
    raw["stages"] = stages
    if stages is None:
        return raw
    if not isinstance(stages, dict) or stages.get("source") not in ("state", "custom"):
        reject("Invalid stage source.")
    allowed = {"source", "order", "hidden", "aliases"}
    if stages["source"] == "custom":
        allowed.add("field_id")
        if not isinstance(stages.get("field_id"), str) or not raw.get("group_by"):
            reject("Custom stages require a custom group field.")
        try:
            field_id = UUID(stages["field_id"])
            if field_id != UUID(raw["group_by"]["field_id"]):
                reject("Stage source must match grouping.")
        except (ValueError, TypeError, AttributeError):
            reject("Invalid stage field.")
        field = resolve_fields(project.id, [str(field_id)], for_write=False)[field_id]
        stages["field_id"] = str(field_id)
        if field.type == "checkbox":
            identifiers = {"true", "false", "unset"}
        elif field.type == "select":
            identifiers = {str(option.id) for option in field.options.all()} | {"unset"}
        else:
            reject("Stages require a select or checkbox field.")
    else:
        if raw.get("group_by"):
            reject("Native stages cannot use custom grouping.")
        identifiers = {str(pk) for pk in State.objects.filter(project=project).values_list("id", flat=True)} | {"None"}
    if set(stages) != allowed:
        reject("Invalid stage presentation object.")
    for key in ("order", "hidden"):
        items = stages[key]
        if (not isinstance(items, list) or len(items) > len(identifiers)
                or any(not isinstance(item, str) or item not in identifiers for item in items)
                or len(set(items)) != len(items)):
            reject("Unknown, duplicate or stale stage reference.")
    aliases = stages["aliases"]
    if not isinstance(aliases, dict) or set(aliases) - identifiers:
        reject("Unknown or stale stage alias reference.")
    stages["aliases"] = {key: validate_alias(value) for key, value in aliases.items()}
    return raw
