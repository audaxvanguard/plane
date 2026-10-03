# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from rest_framework import serializers
from plane.db.models import ProjectCustomField, ProjectCustomFieldOption
from plane.db.models.custom_field import normalized_name


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
