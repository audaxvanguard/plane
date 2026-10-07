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

@pytest.mark.parametrize('model_name', ['Issue','DraftIssue'])
def test_bulk_writes_cannot_assign_retired_state(crm_project,model_name):
    from django.db import transaction, IntegrityError
    from django.utils import timezone
    from plane import db
    from plane.db.models import State, Issue, DraftIssue
    Model={'Issue':Issue,'DraftIssue':DraftIssue}[model_name]
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Retired bulk',group='started')
    target=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Active bulk',group='started')
    item=Model.objects.create(project=crm_project,workspace=crm_project.workspace,name='Bulk',state=target)
    source.deleted_at=timezone.now();source.save(update_fields=['deleted_at'])
    with pytest.raises(IntegrityError),transaction.atomic():
        Model.all_objects.filter(id=item.id).update(state_id=source.id)
    item.refresh_from_db();assert item.state_id==target.id


def test_default_state_is_not_replaceable(crm_project,crm_admin_client):
    source=State.objects.create(project=crm_project,workspace=crm_project.workspace,name='Default',default=True)
    url=f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/states/{source.id}/replacement-preview/'
    response=crm_admin_client.get(url)
    assert response.status_code==400


def test_replacement_counts_all_references_and_retains_values_history(crm_project, crm_admin, field_factory):
    from django.utils import timezone
    from plane.db.models import DraftIssue, IssueActivity
    from plane.app.services.project_stage_operations import preview_state_replacement, replace_and_delete_state
    from plane.app.services.custom_fields import apply_custom_values, serialize_custom_values
    source = State.objects.create(project=crm_project, name='Reference source', group='started')
    target = State.objects.create(project=crm_project, name='Reference target', group='completed')
    items = [Issue.objects.create(project=crm_project, name=str(n), state=source) for n in range(3)]
    Issue.objects.filter(pk=items[1].pk).update(archived_at=timezone.now())
    Issue.objects.filter(pk=items[2].pk).update(deleted_at=timezone.now())
    draft = DraftIssue.objects.create(project=crm_project, name='Referenced draft', state=source)
    field = field_factory(crm_project, 'currency')
    apply_custom_values(items[0], {str(field.id): '0.10'}, actor=crm_admin)
    assert preview_state_replacement(user=crm_admin, project=crm_project, state_id=source.id)['item_count'] == 4
    replace_and_delete_state(user=crm_admin, project=crm_project, state_id=source.id, replacement_state_id=target.id, expected_item_count=4)
    assert not Issue.all_objects.filter(state=source).exists()
    assert not DraftIssue.all_objects.filter(state=source).exists()
    assert Issue.all_objects.filter(id__in=[item.id for item in items], state=target, completed_at__isnull=False).count() == 3
    draft.refresh_from_db(); assert draft.state_id == target.id
    assert serialize_custom_values(items[0])[str(field.id)] == '0.10'
    assert IssueActivity.objects.filter(issue_id__in=[item.id for item in items], field='state').count() == 3


def test_replacement_failure_rolls_back_every_item_and_history(crm_project, crm_admin, monkeypatch):
    from plane.db.models import IssueActivity
    from plane.app.services import project_stage_operations as service
    source = State.objects.create(project=crm_project, name='Rollback source', group='started')
    target = State.objects.create(project=crm_project, name='Rollback target', group='completed')
    items = [Issue.objects.create(project=crm_project, name=str(n), state=source) for n in range(2)]
    original = service.track_state
    calls = 0
    def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2: raise RuntimeError('injected failure')
        return original(*args, **kwargs)
    monkeypatch.setattr(service, 'track_state', fail_second)
    with pytest.raises(RuntimeError):
        service.replace_and_delete_state(user=crm_admin, project=crm_project, state_id=source.id, replacement_state_id=target.id, expected_item_count=2)
    assert Issue.objects.filter(id__in=[item.id for item in items], state=source, completed_at__isnull=True).count() == 2
    assert State.objects.filter(pk=source.id).exists()
    assert not IssueActivity.objects.filter(issue_id__in=[item.id for item in items], field='state').exists()


@pytest.mark.django_db(transaction=True)
def test_concurrent_bulk_assignment_cannot_land_on_retired_state(crm_project, crm_admin, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    from django.db import close_old_connections, connections, connection, IntegrityError
    import time
    from plane.app.services import project_stage_operations as service
    source = State.objects.create(project=crm_project, name='Concurrent source', group='started')
    target = State.objects.create(project=crm_project, name='Concurrent target', group='started')
    existing = Issue.objects.create(project=crm_project, name='Existing', state=source)
    newcomer = Issue.objects.create(project=crm_project, name='New assignment', state=target)
    removal_locked = Event(); assignment_started = Event()
    original = service.track_state
    assignment_pid = []
    def paused_track(*args, **kwargs):
        removal_locked.set()
        assert assignment_started.wait(10)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with connection.cursor() as cursor:
                cursor.execute('SELECT wait_event_type FROM pg_stat_activity WHERE pid=%s', [assignment_pid[0]])
                if cursor.fetchone() == ('Lock',):
                    break
            time.sleep(0.01)
        else:
            pytest.fail('Assignment did not actually block on the locked source state')
        return original(*args, **kwargs)
    monkeypatch.setattr(service, 'track_state', paused_track)
    def remove():
        close_old_connections()
        try:
            service.replace_and_delete_state(user=crm_admin, project=crm_project, state_id=source.id, replacement_state_id=target.id, expected_item_count=1)
        finally: connections.close_all()
    def assign():
        close_old_connections()
        try:
            assert removal_locked.wait(10)
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_backend_pid()')
                assignment_pid.append(cursor.fetchone()[0])
            assignment_started.set()
            with pytest.raises(IntegrityError):
                Issue.objects.filter(pk=newcomer.pk).update(state_id=source.id)
        finally: connections.close_all()
    with ThreadPoolExecutor(max_workers=2) as pool:
        removal = pool.submit(remove); assignment = pool.submit(assign)
        removal.result(timeout=20); assignment.result(timeout=20)
    existing.refresh_from_db(); newcomer.refresh_from_db()
    assert existing.state_id == target.id and newcomer.state_id == target.id
    assert not Issue.all_objects.filter(state=source).exists()
