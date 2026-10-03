# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from rest_framework import serializers
from django.db import transaction
from django.db.models import Prefetch, prefetch_related_objects
from plane.db.models import IssueCustomFieldValue
from functools import wraps
from uuid import UUID
from plane.db.models import Project, DraftIssue
from plane.app.services.custom_fields import (
    normalize_patch,
    resolve_fields,
    apply_custom_values,
    serialize_custom_values,
    validate_historical_scalar,
    stored_scalar,
    value_rows,
    assert_value_access,
    validate_draft_values,
)
from plane.db.models import ProjectCustomField, ProjectCustomFieldOption
from plane.db.models.custom_field import normalized_name


class CustomValuesListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        rows = list(data.all() if hasattr(data, "all") else data)
        values = IssueCustomFieldValue.objects.select_related("field", "option")
        if rows and isinstance(rows[0], dict):
            grouped = {}
            ids = [row["id"] for row in rows]
            for value in values.filter(issue_id__in=ids):
                grouped.setdefault(str(value.issue_id), {})[str(value.field_id)] = (
                    stored_scalar(value)
                )
            for row in rows:
                row["custom_values"] = grouped.get(str(row["id"]), {})
        elif rows:
            prefetch_related_objects(
                rows, Prefetch("custom_field_values", queryset=values)
            )
        return super().to_representation(rows)


class CustomValuesField(serializers.Field):
    def __init__(self, **kwargs):
        super().__init__(source="*", required=False, **kwargs)

    def to_internal_value(self, data):
        return {"_custom_values": normalize_patch(data)}

    def to_representation(self, instance):
        if isinstance(instance, dict):
            return instance.get("custom_values", {})
        if hasattr(instance, "custom_values"):
            return instance.custom_values
        return serialize_custom_values(instance)


class CustomValuesMixin(serializers.Serializer):
    custom_values = CustomValuesField()


def issue_custom_values_write(method):
    """Wrap the existing relationship management without changing legacy input."""

    @wraps(method)
    def wrapped(self, *args, **kwargs):
        data = kwargs.get("validated_data", args[-1] if args else None)
        marker = object()
        patch = data.pop("_custom_values", marker)
        if patch is marker:
            return method(self, *args, **kwargs)
        actor = self.context.get("actor")
        if actor is None and self.context.get("request") is not None:
            actor = self.context["request"].user
        with transaction.atomic():
            project_id = (
                self.instance.project_id
                if self.instance
                else self.context.get("project_id")
            )
            project = Project.objects.select_for_update().get(id=project_id)
            assert_value_access(project, actor)
            fields = resolve_fields(project.id, list(patch), for_write=True)
            old = (
                {
                    str(row.field_id): stored_scalar(row)
                    for row in value_rows(self.instance)
                }
                if self.instance
                else {}
            )
            normalized = {
                key: validate_historical_scalar(fields[UUID(key)], raw, old.get(key))
                for key, raw in patch.items()
            }
            instance = method(self, *args, **kwargs)
            instance._custom_field_changes = apply_custom_values(
                instance, normalized, actor=actor
            )
            return instance

    return wrapped


def draft_custom_values_write(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        data = kwargs.get("validated_data", args[-1] if args else None)
        patch = data.pop("_custom_values", {})
        confirmed = data.pop("confirm_clear_custom_values", False)
        marker = object()
        supplied_project = data.pop("project", marker)
        project_id = (
            (supplied_project.id if supplied_project is not None else None)
            if supplied_project is not marker
            else self.context.get(
                "project_id", self.instance.project_id if self.instance else None
            )
        )
        workspace_id = (
            self.instance.workspace_id
            if self.instance
            else self.context["workspace_id"]
        )
        actor = self.context.get("actor")
        if actor is None and self.context.get("request") is not None:
            actor = self.context["request"].user
        with transaction.atomic():
            lock_ids = [
                value
                for value in (
                    project_id,
                    self.instance.project_id if self.instance else None,
                )
                if value
            ]
            projects = {
                str(project.id): project
                for project in Project.objects.select_for_update()
                .filter(id__in=lock_ids)
                .order_by("id")
            }
            project = projects.get(str(project_id)) if project_id else None
            if project_id and (project is None or project.workspace_id != workspace_id):
                raise serializers.ValidationError(
                    "Project must belong to this workspace."
                )
            if self.instance:
                authoritative = DraftIssue.objects.select_for_update().get(
                    id=self.instance.id
                )
                if authoritative.project_id != self.instance.project_id:
                    raise serializers.ValidationError(
                        "Draft project changed; reload before saving."
                    )
                self.instance.custom_values = authoritative.custom_values
            existing = self.instance.custom_values if self.instance else {}
            changed = self.instance is not None and str(
                self.instance.project_id or ""
            ) != str(project_id or "")
            if project is not None and (patch or existing or changed):
                assert_value_access(project, actor)
            if changed and existing and not confirmed:
                raise serializers.ValidationError(
                    "Confirm clearing custom values before changing project."
                )
            baseline = {} if changed else existing
            data["custom_values"] = validate_draft_values(project, patch, baseline)
            self.context["project_id"] = project.id if project else None
            if self.instance:
                if changed:
                    from plane.db.models import (
                        DraftIssueAssignee,
                        DraftIssueLabel,
                        DraftIssueCycle,
                        DraftIssueModule,
                    )

                    for model in (
                        DraftIssueAssignee,
                        DraftIssueLabel,
                        DraftIssueCycle,
                        DraftIssueModule,
                    ):
                        model.objects.filter(draft_issue=self.instance).delete(
                            soft=False
                        )
                    for field in ("state", "parent", "estimate_point"):
                        data.setdefault(field, None)
                    self.instance.project = project
                data["project"] = project
            return method(self, *args, **kwargs)

    return wrapped


class CustomFieldOptionSerializer(serializers.ModelSerializer):
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", default="#808080")
    label = serializers.CharField(max_length=255, trim_whitespace=True)

    class Meta:
        model = ProjectCustomFieldOption
        fields = ("id", "label", "color", "sort_order", "is_retired")
        read_only_fields = ("id",)


class CustomFieldSerializer(serializers.ModelSerializer):
    options = CustomFieldOptionSerializer(many=True, read_only=True)
    project_id = serializers.UUIDField(read_only=True)
    description = serializers.CharField(
        max_length=2000, allow_blank=True, required=False
    )

    class Meta:
        model = ProjectCustomField
        fields = (
            "id",
            "project_id",
            "name",
            "description",
            "type",
            "sort_order",
            "is_archived",
            "options",
        )
        read_only_fields = ("id", "project_id", "options")

    def validate_name(self, value):
        value = normalized_name(value)
        if not value:
            raise serializers.ValidationError("Name cannot be blank.")
        queryset = ProjectCustomField.objects.filter(
            project=self.context["project"], name_key=value.casefold()
        )
        if self.instance:
            queryset = queryset.exclude(id=self.instance.id)
        if queryset.exists():
            raise serializers.ValidationError("A field with this name already exists.")
        return value

    def validate(self, attrs):
        if self.instance and "type" in attrs and attrs["type"] != self.instance.type:
            raise serializers.ValidationError({"type": "Field type cannot be changed."})
        activating = not attrs.get(
            "is_archived", self.instance.is_archived if self.instance else False
        )
        if activating and (not self.instance or self.instance.is_archived):
            if (
                ProjectCustomField.objects.filter(
                    project=self.context["project"], is_archived=False
                ).count()
                >= 50
            ):
                raise serializers.ValidationError(
                    "A project may have at most 50 active fields."
                )
        return attrs
