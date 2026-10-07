# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import pytest
from plane.db.models import Issue, IssueView
from plane.app.services.custom_fields import apply_custom_values

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('layout', ['spreadsheet', 'gantt'])
def test_saved_custom_stages_do_not_group_flat_layout_refresh(
    crm_project, crm_admin, crm_admin_client, field_factory, currency_field, mocker, layout
):
    mocker.patch('plane.app.views.issue.base.recent_visited_task.delay')
    stage = field_factory(crm_project, 'checkbox')
    items = [Issue.objects.create(project=crm_project, workspace=crm_project.workspace, name=str(i)) for i in range(3)]
    for item, value in zip(items, [False, True, None]):
        apply_custom_values(item, {str(stage.id): value, str(currency_field.id): '0.00'}, actor=crm_admin)
    custom = {'version':2, 'columns':[{'kind':'builtin','key':'name'},{'kind':'custom','field_id':str(currency_field.id),'alias':'Saved BRL'}],
              'conditions':[], 'sort':None, 'group_by':{'field_id':str(stage.id)},
              'stages':{'source':'custom','field_id':str(stage.id),'order':[],'hidden':[],'aliases':{}},
              'metrics':[], 'count_scopes':['all']}
    view = IssueView.objects.create(project=crm_project, workspace=crm_project.workspace, name='Pipeline', owned_by=crm_admin,
                                    custom_view=custom, display_filters={'layout':'kanban','group_by':'custom_field:'+str(stage.id)})
    custom['columns'][1]['alias'] = 'Temporary BRL'
    response = crm_admin_client.get(f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/',
                                   {'view_id':str(view.id),'layout':layout,'custom_view':json.dumps(custom),'per_page':100})
    assert response.status_code == 200, response.data
    assert isinstance(response.data['results'], list), 'Flat layouts require flat rows, not stage buckets'
    assert {str(row['id']) for row in response.data['results']} == {str(item.id) for item in items}
    view.refresh_from_db()
    assert view.custom_view['columns'][1]['alias'] == 'Saved BRL'


def test_calendar_uses_native_date_groups_not_saved_custom_stage_groups(
    crm_project, crm_admin, crm_admin_client, field_factory, mocker
):
    mocker.patch('plane.app.views.issue.base.recent_visited_task.delay')
    stage = field_factory(crm_project, 'checkbox')
    item = Issue.objects.create(project=crm_project, workspace=crm_project.workspace, name='Scheduled', target_date='2026-10-07')
    apply_custom_values(item, {str(stage.id): False}, actor=crm_admin)
    custom = {'version':1,'columns':[],'conditions':[],'sort':None,'group_by':{'field_id':str(stage.id)},'metrics':[]}
    response = crm_admin_client.get(f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/',
                                   {'layout':'calendar','group_by':'target_date','custom_view':json.dumps(custom)})
    assert response.status_code == 200, response.data
    assert '2026-10-07' in response.data['results']
    assert 'false' not in response.data['results']
