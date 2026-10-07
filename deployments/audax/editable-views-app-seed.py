# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Seed only the disposable acceptance database; emit runtime-only sessions."""
import json
import os
from uuid import uuid4
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'plane.settings.custom_fields_test')
import django
django.setup()
from django.db import connection
assert connection.settings_dict['HOST'] == 'test-db'
assert connection.settings_dict['NAME'] == 'plane_custom_fields_test'
from plane.db.models import User, Profile, Workspace, WorkspaceMember, Project, ProjectMember, State, ProjectCustomField, ProjectCustomFieldOption, Issue, IssueView
from plane.db.models.session import SessionStore
from plane.app.services.custom_fields import apply_custom_values


def actor(label):
    user = User.objects.create(username=uuid4().hex, email=f'compiled-{uuid4().hex}@test.invalid', first_name=label)
    profile, _ = Profile.objects.get_or_create(user=user)
    profile.is_onboarded = True
    profile.save()
    return user


def session(user):
    store = SessionStore()
    store['_auth_user_id'] = str(user.id)
    store['_auth_user_backend'] = 'django.contrib.auth.backends.ModelBackend'
    store['_auth_user_hash'] = user.get_session_auth_hash()
    store.save()
    return store.session_key


owner = actor('Compiled acceptance')
viewer = actor('Second actor')
w = Workspace.objects.create(name='Compiled acceptance', slug=f'compiled-{uuid4().hex[:8]}', owner=owner)
p = Project.objects.create(workspace=w, name='Compiled acceptance', identifier='COMPILED', created_by=owner)
for user, role in ((owner, 20), (viewer, 15)):
    WorkspaceMember.objects.create(workspace=w, member=user, role=role)
    ProjectMember.objects.create(workspace=w, project=p, member=user, role=role)
backlog = State.objects.create(project=p, name='Backlog', group='backlog', default=True)
source = State.objects.create(project=p, name='To replace', group='started')
target = State.objects.create(project=p, name='Replacement', group='completed')
amount = ProjectCustomField.objects.create(project=p, type='currency', name='Receita')
stage = ProjectCustomField.objects.create(project=p, type='select', name='Etapa')
option = ProjectCustomFieldOption.objects.create(project=p, field=stage, label='Won')
ids = {}
for name, value in [('Zero', '0.00'), ('Exact', '9007199254740992.01')]:
    item = Issue.objects.create(project=p, name=name, state=backlog)
    ids[name] = str(item.id)
    apply_custom_values(item, {str(amount.id): value, str(stage.id): str(option.id)}, actor=owner)
replacement_item = Issue.objects.create(project=p, name='Replace me', state=source)
view = IssueView.objects.create(workspace=w, project=p, name='Compiled pipeline', owned_by=owner, created_by=owner,
    display_filters={'layout': 'kanban', 'group_by': 'state', 'sub_group_by': None, 'order_by': '-created_at', 'sub_issue': True},
    display_properties={'state': True, 'custom_fields': [str(amount.id)]},
    custom_view={'version': 2, 'columns': [{'kind': 'builtin', 'key': 'name'}, {'kind': 'custom', 'field_id': str(amount.id), 'alias': 'Total BRL'}],
        'conditions': [], 'sort': None, 'group_by': None, 'metrics': [{'field_id': str(amount.id), 'scopes': ['all', 'open', 'filtered']}],
        'stages': None, 'count_scopes': ['all', 'open', 'filtered']})
other = Project.objects.create(workspace=w, name='Other project context', identifier='OTHER', created_by=owner)
ProjectMember.objects.create(workspace=w, project=other, member=owner, role=20)
State.objects.create(project=other, name='Backlog', group='backlog', default=True)
other_field = ProjectCustomField.objects.create(project=other, type='currency', name='Receita')
other_view = IssueView.objects.create(workspace=w, project=other, name='Other pipeline', owned_by=owner, created_by=owner,
    display_filters={'layout':'kanban','group_by':'state','sub_issue':True},
    custom_view={'version':2,'columns':[{'kind':'builtin','key':'name'},{'kind':'custom','field_id':str(other_field.id),'alias':'Other total'}],
        'conditions':[],'sort':None,'group_by':None,'metrics':[{'field_id':str(other_field.id),'scopes':['all']}],
        'stages':None,'count_scopes':['all']})
print('COMPILED_FIXTURE=' + json.dumps({'workspace': w.slug, 'project': str(p.id), 'view': str(view.id),
    'field': str(amount.id), 'stage': str(stage.id), 'option': str(option.id), 'zero': ids['Zero'],
    'source': str(source.id), 'target': str(target.id), 'replacement_item': str(replacement_item.id),
    'other_project':str(other.id), 'other_view':str(other_view.id), 'other_field':str(other_field.id),
    'session': session(owner), 'second_session': session(viewer)}))
