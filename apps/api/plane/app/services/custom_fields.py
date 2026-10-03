# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from uuid import UUID
from rest_framework.exceptions import ValidationError
from plane.db.models import ProjectCustomField


def resolve_fields(project_id, ids, *, for_write):
    try:
        normalized = {UUID(str(value)) for value in ids}
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"custom_values": "Invalid field identifier."})
    fields = {
        field.id: field
        for field in ProjectCustomField.objects.filter(
            project_id=project_id, id__in=normalized
        )
    }
    if set(fields) != normalized:
        raise ValidationError(
            {"custom_values": "Unknown or inaccessible custom field."}
        )
    if for_write and any(field.is_archived for field in fields.values()):
        raise ValidationError({"custom_values": "Archived fields cannot be edited."})
    return fields
