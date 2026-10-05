# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import DynamicBaseSerializer
from .custom_field import CustomValuesListSerializer
from plane.app.services.custom_fields import serialize_custom_values
from plane.db.models import IssueView, Project
from plane.app.services.custom_field_queries import validate_custom_view
from plane.utils.issue_filters import issue_filters


class ViewIssueListSerializer(serializers.Serializer):
    class Meta:
        list_serializer_class = CustomValuesListSerializer

    def get_assignee_ids(self, instance):
        return [assignee.assignee_id for assignee in instance.issue_assignee.all()]

    def get_label_ids(self, instance):
        return [label.label_id for label in instance.label_issue.all()]

    def get_module_ids(self, instance):
        return [module.module_id for module in instance.issue_module.all()]

    def to_representation(self, instance):
        data = {
            "id": instance.id,
            "name": instance.name,
            "custom_values": serialize_custom_values(instance),
            "state_id": instance.state_id,
            "sort_order": instance.sort_order,
            "completed_at": instance.completed_at,
            "estimate_point": instance.estimate_point_id,
            "priority": instance.priority,
            "start_date": instance.start_date,
            "target_date": instance.target_date,
            "sequence_id": instance.sequence_id,
            "project_id": instance.project_id,
            "parent_id": instance.parent_id,
            "cycle_id": instance.cycle_id,
            "sub_issues_count": instance.sub_issues_count,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
            "created_by": instance.created_by_id,
            "updated_by": instance.updated_by_id,
            "attachment_count": instance.attachment_count,
            "link_count": instance.link_count,
            "is_draft": instance.is_draft,
            "archived_at": instance.archived_at,
            "state__group": instance.state.group if instance.state else None,
            "assignee_ids": self.get_assignee_ids(instance),
            "label_ids": self.get_label_ids(instance),
            "module_ids": self.get_module_ids(instance),
        }
        return data


class IssueViewSerializer(DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueView
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "query",
            "owned_by",
            "access",
            "is_locked",
        ]

    def validate_custom_view(self, value):
        project = self.instance.project if self.instance else None
        view = self.context.get('view')
        if self.instance is None and view is not None and view.kwargs.get('project_id'):
            project = Project.objects.filter(id=view.kwargs['project_id'], workspace__slug=view.kwargs.get('slug')).first()
        return validate_custom_view(project, value)

    def validate(self, attrs):
        config = attrs.get('custom_view', self.instance.custom_view if self.instance else {})
        display = attrs.get('display_filters', self.instance.display_filters if self.instance else {})
        if config.get('stages') and config['stages']['source'] == 'state' and display.get('group_by') != 'state':
            raise serializers.ValidationError({'custom_view': 'Native stage presentation requires state grouping.'})
        return attrs

    def create(self, validated_data):
        query_params = validated_data.get("filters", {})
        if bool(query_params):
            validated_data["query"] = issue_filters(query_params, "POST")
        else:
            validated_data["query"] = {}
        return IssueView.objects.create(**validated_data)

    def update(self, instance, validated_data):
        if 'filters' in validated_data:
            query_params = validated_data['filters']
            validated_data['query'] = issue_filters(query_params, 'PATCH') if query_params else {}
        return super().update(instance, validated_data)
