# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import pytest
from django.db import transaction
from plane.db.models import Issue, IssueActivity, ProjectCustomFieldOption, DraftIssue
from plane.app.services.custom_fields import apply_custom_values, clear_project_values, promote_draft_values, serialize_custom_values

pytestmark = pytest.mark.django_db


def test_activity_is_durable_typed_and_keeps_historical_names(crm_project, crm_admin, field_factory):
    issue = Issue.objects.create(project=crm_project, name='History')
    amount = field_factory(crm_project, 'currency', 'Receita original')
    choice = field_factory(crm_project, 'select', 'Etapa original')
    option = ProjectCustomFieldOption.objects.create(project=crm_project, field=choice, label='Original option')
    apply_custom_values(issue, {str(amount.id): '9007199254740992.01', str(choice.id): str(option.id)}, actor=crm_admin)
    rows = IssueActivity.objects.filter(issue=issue, field__startswith='custom_field:')
    assert rows.count() == 2
    row = rows.get(field=f'custom_field:{amount.id}')
    assert row.actor_id == crm_admin.id
    assert row.workspace_id == crm_project.workspace_id
    assert row.project_id == crm_project.id
    assert json.loads(row.old_value)['value'] is None
    assert json.loads(row.new_value)['value'] == '9007199254740992.01'
    amount.name = 'Renamed'; amount.is_archived = True; amount.save()
    option.label = 'Changed option'; option.is_retired = True; option.save()
    row.refresh_from_db()
    assert json.loads(row.new_value)['label'] == 'Receita original'
    assert json.loads(rows.get(field=f'custom_field:{choice.id}').new_value)['option_label'] == 'Original option'


def test_noop_false_zero_clear_and_transaction_rollback(crm_project, crm_admin, field_factory):
    issue = Issue.objects.create(project=crm_project, name='Atomic history')
    flag = field_factory(crm_project, 'checkbox')
    amount = field_factory(crm_project, 'currency')
    patch = {str(flag.id): False, str(amount.id): '0.00'}
    apply_custom_values(issue, patch, actor=crm_admin)
    assert IssueActivity.objects.filter(issue=issue).count() == 2
    apply_custom_values(issue, patch, actor=crm_admin)
    apply_custom_values(issue, {}, actor=crm_admin)
    assert IssueActivity.objects.filter(issue=issue).count() == 2
    with pytest.raises(RuntimeError), transaction.atomic():
        apply_custom_values(issue, {str(amount.id): '1.00'}, actor=crm_admin)
        raise RuntimeError('rollback')
    assert serialize_custom_values(issue)[str(amount.id)] == '0.00'
    assert IssueActivity.objects.filter(issue=issue).count() == 2
    clear_project_values(issue, actor=crm_admin, confirmed=True)
    assert IssueActivity.objects.filter(issue=issue).count() == 4
    assert all(json.loads(row.new_value)['value'] is None for row in IssueActivity.objects.filter(issue=issue).order_by('-created_at')[:2])


def test_promoted_draft_records_history(crm_project, crm_admin, field_factory):
    field = field_factory(crm_project, 'text')
    draft = DraftIssue.objects.create(project=crm_project, name='Draft', custom_values={str(field.id): 'Preserved'})
    issue = Issue.objects.create(project=crm_project, name='Promoted')
    promote_draft_values(draft, issue, actor=crm_admin)
    row = IssueActivity.objects.get(issue=issue, field=f'custom_field:{field.id}')
    assert json.loads(row.new_value)['value'] == 'Preserved'
