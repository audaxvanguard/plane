# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from uuid import uuid4
import pytest
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, State


def user(label):
    return User.objects.create(email=f'{label}-{uuid4().hex[:8]}@test.invalid', first_name=label)


@pytest.fixture
def crm_admin(db):
    return user('CRM admin')


@pytest.fixture
def crm_member(db):
    return user('CRM member')


@pytest.fixture
def crm_viewer(db):
    return user('CRM viewer')


@pytest.fixture
def other_admin(db):
    return user('Other admin')


def project(owner, label):
    workspace=Workspace.objects.create(name=label, slug=f'cf-{uuid4().hex[:8]}', owner=owner)
    WorkspaceMember.objects.create(workspace=workspace, member=owner, role=20)
    result=Project.objects.create(workspace=workspace, name=label, identifier=uuid4().hex[:6].upper(), created_by=owner)
    ProjectMember.objects.create(workspace=workspace, project=result, member=owner, role=20)
    return result


@pytest.fixture
def crm_project(db, crm_admin, crm_member, crm_viewer):
    result=project(crm_admin,'CRM test project')
    for member,role in ((crm_member,15),(crm_viewer,5)):
        WorkspaceMember.objects.create(workspace=result.workspace, member=member, role=role)
        ProjectMember.objects.create(workspace=result.workspace, project=result, member=member, role=role)
    return result


@pytest.fixture
def other_project(db, other_admin):
    return project(other_admin,'Other tenant')


def client_for(actor):
    result=APIClient()
    result.force_authenticate(user=actor)
    return result


@pytest.fixture
def crm_admin_client(crm_project, crm_admin):
    return client_for(crm_admin)


@pytest.fixture
def crm_member_client(crm_project, crm_member):
    return client_for(crm_member)


@pytest.fixture
def crm_viewer_client(crm_project, crm_viewer):
    return client_for(crm_viewer)


@pytest.fixture
def project_endpoint():
    return lambda project,suffix: f'/api/workspaces/{project.workspace.slug}/projects/{project.id}/{suffix}'
