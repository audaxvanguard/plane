# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from plane.db.models import State, Issue
pytestmark = pytest.mark.django_db

def test_state_replacement_preview_permissions_and_atomic_transition(crm_project,crm_admin_client,crm_member_client,mocker):
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Old stage',group='started')
    target=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Done stage',group='completed')
    item=Issue.objects.create(project=crm_project,workspace=crm_project.workspace,name='Keep',state=source)
    url=f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/states/{source.id}/'
    assert crm_member_client.get(url+'replacement-preview/').status_code==403
    preview=crm_admin_client.get(url+'replacement-preview/')
    assert preview.status_code==200,preview.data
    assert preview.data['item_count']==1
    invalid=crm_admin_client.post(url+'replace-and-delete/',{'replacement_state_id':str(target.id),'expected_item_count':0,'confirmed':True},format='json')
    assert invalid.status_code==400
    item.refresh_from_db();assert item.state_id==source.id
    response=crm_admin_client.post(url+'replace-and-delete/',{'replacement_state_id':str(target.id),'expected_item_count':1,'confirmed':True},format='json')
    assert response.status_code==204,response.data
    item.refresh_from_db();assert item.state_id==target.id;assert item.completed_at is not None

def test_retired_state_cannot_receive_a_stale_assignment(crm_project,crm_admin_client):
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Retire',group='started')
    target=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Keep',group='started')
    item=Issue.objects.create(project=crm_project,workspace=crm_project.workspace,name='Keep',state=target)
    url=f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/states/{source.id}/replace-and-delete/'
    assert crm_admin_client.post(url,{'replacement_state_id':str(target.id),'expected_item_count':0,'confirmed':True},format='json').status_code==204
    from django.core.exceptions import ValidationError
    item.state=source
    with pytest.raises(ValidationError): item.save(update_fields=['state'])
    item.refresh_from_db();assert item.state_id==target.id

def test_stale_draft_assignment_is_rejected(crm_project):
    from plane.db.models import DraftIssue
    from django.core.exceptions import ValidationError
    from django.utils import timezone
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Old draft')
    State.objects.filter(pk=source.pk).update(deleted_at=timezone.now())
    with pytest.raises(ValidationError):
        DraftIssue.objects.create(project=crm_project,workspace=crm_project.workspace,name='Draft',state=source)

def test_default_state_is_not_replaceable(crm_project,crm_admin_client):
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Default',default=True)
    url=f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/states/{source.id}/replacement-preview/'
    response=crm_admin_client.get(url)
    assert response.status_code==400
