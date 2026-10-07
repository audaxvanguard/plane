# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import pytest
from plane.db.models import Issue, IssueComment
from plane.app.services.custom_fields import apply_custom_values

pytestmark = pytest.mark.django_db


def test_default_history_serializes_property_snapshots_and_native_comments(
    crm_project, crm_admin, crm_admin_client, currency_field
):
    item = Issue.objects.create(project=crm_project, workspace=crm_project.workspace, name='History')
    apply_custom_values(item, {str(currency_field.id): '0.00'}, actor=crm_admin)
    comment = IssueComment.objects.create(project=crm_project, workspace=crm_project.workspace, issue=item, actor=crm_admin,
                                         comment_html='<p>Native comment</p>')
    response = crm_admin_client.get(f'/api/workspaces/{crm_project.workspace.slug}/projects/{crm_project.id}/issues/{item.id}/history/')
    assert response.status_code == 200, response.data
    assert len(response.data) == 2
    property_row = next(row for row in response.data if row.get('field', '').startswith('custom_field:'))
    assert json.loads(property_row['new_value'])['value'] == '0.00'
    assert any(str(row['id']) == str(comment.id) for row in response.data)
    assert [row['created_at'] for row in response.data] == sorted(row['created_at'] for row in response.data)
