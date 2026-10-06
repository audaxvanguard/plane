# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Explicit native-state replacement; never rewrites saved query references."""
import json
from django.db import transaction
from django.utils import timezone
from django.db.models import Q
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from plane.db.models import Project, ProjectMember, State, Issue, DraftIssue, IssueView, IssueActivity
from plane.bgtasks.issue_activities_task import track_state

def reject(message):
    raise ValidationError({'error': message})

def authorize(user, project):
    if not ProjectMember.objects.filter(project=project,member=user,is_active=True,role=20).exists():
        raise PermissionDenied('Project administrator required.')

def source_state(project,state_id,lock=False):
    query=State.objects.select_for_update() if lock else State.objects
    state=query.filter(project=project,pk=state_id).first()
    if state is None: raise NotFound('State not found.')
    if state.default or state.is_triage or project.default_state_id==state.id:
        reject('Default and triage states cannot be replaced or removed.')
    return state

def references(user,project,state):
    token=str(state.id)
    return [str(view.id) for view in IssueView.objects.filter(project=project).filter(Q(owned_by=user)|Q(access=1)) if token in json.dumps([view.custom_view,view.rich_filters,view.filters],default=str)]

def preview_state_replacement(*,user,project,state_id):
    authorize(user,project)
    state=source_state(project,state_id)
    return {'item_count':Issue.all_objects.filter(project=project,state=state).count()+DraftIssue.all_objects.filter(project=project,state=state).count(),'referenced_view_ids':references(user,project,state)}

@transaction.atomic
def replace_and_delete_state(*,user,project,state_id,replacement_state_id,expected_item_count):
    authorize(user,project)
    if type(expected_item_count) is not int or expected_item_count<0: reject('Invalid expected item count.')
    project=Project.objects.select_for_update().get(pk=project.pk)
    # Match the normal issue-creation advisory lock order before locking states.
    from plane.utils.uuid import convert_uuid_to_integer
    from django.db import connection
    with connection.cursor() as cursor: cursor.execute('SELECT pg_advisory_xact_lock(%s)',[convert_uuid_to_integer(project.id)])
    source=source_state(project,state_id,True)
    target=State.objects.select_for_update().filter(project=project,pk=replacement_state_id,is_triage=False).first()
    if not target or target.id==source.id: reject('Choose a different active state in this project.')
    items=list(Issue.all_objects.select_for_update().filter(project=project,state=source).order_by('id'))
    drafts=list(DraftIssue.all_objects.select_for_update().filter(project=project,state=source).order_by('id'))
    if len(items)+len(drafts)!=expected_item_count: reject('Affected items changed. Refresh the preview and confirm again.')
    for item in items:
        activities=[]
        track_state({'state_id':str(target.id)},{'state_id':str(source.id)},str(item.id),str(project.id),str(project.workspace_id),str(user.id),activities,timezone.now().timestamp())
        item.state=target
        item.updated_by=user
        item.save(update_fields=['state','updated_by','updated_at'],disable_auto_set_user=True)
        IssueActivity.objects.bulk_create(activities)
    for draft in drafts:
        draft.state=target
        draft.completed_at=timezone.now() if target.group=='completed' else None
        draft.updated_by=user
        draft.save(update_fields=['state','completed_at','updated_by','updated_at'],disable_auto_set_user=True)
    if Issue.all_objects.filter(state=source).exists() or DraftIssue.all_objects.filter(state=source).exists(): reject('State references changed. Refresh the preview.')
    # All FK references have moved; retain the shared definition/history, without a cascade task.
    State.objects.filter(pk=source.id).update(deleted_at=timezone.now())
