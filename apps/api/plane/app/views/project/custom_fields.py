# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.app.permissions import ROLE
from plane.app.serializers.custom_field import (
    CustomFieldSerializer,
    CustomFieldOptionSerializer,
)
from plane.db.models import (
    Project,
    ProjectMember,
    WorkspaceMember,
    ProjectCustomField,
    ProjectCustomFieldOption,
)


def authorized_project(request, workspace_slug, project_id, *, admin=False, lock=False):
    projects = Project.objects.filter(workspace__slug=workspace_slug)
    if lock:
        projects = projects.select_for_update(of=("self",))
    project = get_object_or_404(projects, id=project_id)
    workspace_member = get_object_or_404(
        WorkspaceMember,
        workspace=project.workspace,
        member=request.user,
        is_active=True,
    )
    member = get_object_or_404(
        ProjectMember, project=project, member=request.user, is_active=True
    )
    if (
        admin
        and member.role != ROLE.ADMIN.value
        and workspace_member.role != ROLE.ADMIN.value
    ):
        raise PermissionDenied("Only project admins can manage custom fields.")
    return project


class CustomFieldCollectionEndpoint(BaseAPIView):
    def get(self, request, workspace_slug, project_id):
        project = authorized_project(request, workspace_slug, project_id)
        fields = ProjectCustomField.objects.filter(project=project).prefetch_related(
            "options"
        )
        return Response(CustomFieldSerializer(fields, many=True).data)

    @transaction.atomic
    def post(self, request, workspace_slug, project_id):
        project = authorized_project(
            request, workspace_slug, project_id, admin=True, lock=True
        )
        serializer = CustomFieldSerializer(
            data=request.data, context={"project": project}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(project=project)
        return Response(serializer.data, status=201)


class CustomFieldDetailEndpoint(BaseAPIView):
    def get(self, request, workspace_slug, project_id, field_id):
        project = authorized_project(request, workspace_slug, project_id)
        field = get_object_or_404(ProjectCustomField, project=project, id=field_id)
        return Response(CustomFieldSerializer(field).data)

    @transaction.atomic
    def patch(self, request, workspace_slug, project_id, field_id):
        project = authorized_project(
            request, workspace_slug, project_id, admin=True, lock=True
        )
        field = get_object_or_404(
            ProjectCustomField.objects.select_for_update(), project=project, id=field_id
        )
        serializer = CustomFieldSerializer(
            field, data=request.data, partial=True, context={"project": project}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CustomFieldOptionCollectionEndpoint(BaseAPIView):
    @transaction.atomic
    def post(self, request, workspace_slug, project_id, field_id):
        project = authorized_project(
            request, workspace_slug, project_id, admin=True, lock=True
        )
        field = get_object_or_404(
            ProjectCustomField.objects.select_for_update(), project=project, id=field_id
        )
        if field.type != "select":
            raise ValidationError("Only single select fields have options.")
        if field.options.count() >= 100:
            raise ValidationError(
                "A field may have at most 100 options, including retired options."
            )
        serializer = CustomFieldOptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project=project, field=field)
        return Response(serializer.data, status=201)


class CustomFieldOptionDetailEndpoint(BaseAPIView):
    @transaction.atomic
    def patch(self, request, workspace_slug, project_id, field_id, option_id):
        project = authorized_project(
            request, workspace_slug, project_id, admin=True, lock=True
        )
        field = get_object_or_404(
            ProjectCustomField.objects.select_for_update(), project=project, id=field_id
        )
        option = get_object_or_404(
            ProjectCustomFieldOption.objects.select_for_update(),
            field=field,
            id=option_id,
        )
        serializer = CustomFieldOptionSerializer(
            option, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
