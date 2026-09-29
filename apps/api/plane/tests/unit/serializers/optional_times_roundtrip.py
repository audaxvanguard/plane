# SPDX-License-Identifier: AGPL-3.0-only
"""Run only against an isolated test database; never production."""
from datetime import date, datetime, timezone
from django.conf import settings
from django.db import transaction
from plane.db.models import User, Workspace, Project, Issue
from plane.app.serializers.draft import DraftIssueCreateSerializer, DraftIssueSerializer
from plane.app.serializers.issue import IssueCreateSerializer, IssueSerializer


def run_roundtrip():
    assert settings.DATABASES['default']['NAME'] == 'plane_test', 'Requires isolated plane_test database'
    with transaction.atomic():
        user = User.objects.create(email='time-test@example.invalid', username='time-test')
        workspace = Workspace.objects.create(name='Isolated time test', slug='isolated-time-test', owner=user)
        project = Project.objects.create(name='Time test', identifier='TT', workspace=workspace)
        issue = Issue.objects.create(name='Date only', project=project, workspace=workspace, start_date=date(2026, 10, 1))
        assert issue.start_time is None
        serializer = IssueCreateSerializer(issue, data={'start_time': '2026-10-01T14:30:00-03:00'},
                                           partial=True, context={'project_id': project.id})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        issue.refresh_from_db()
        assert issue.start_time == datetime(2026, 10, 1, 17, 30, tzinfo=timezone.utc)
        assert IssueSerializer(issue, fields=['start_time']).data['start_time'].startswith('2026-10-01T17:30')
        serializer = IssueCreateSerializer(issue, data={'start_time': None}, partial=True, context={'project_id': project.id})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        issue.refresh_from_db()
        assert issue.start_time is None and issue.start_date == date(2026, 10, 1)
        draft_serializer = DraftIssueCreateSerializer(data={
            'name': 'Optional-time draft', 'start_date': '2026-10-01',
            'start_time': '2026-10-01T14:30:00-03:00',
        }, context={'project_id': project.id, 'workspace_id': workspace.id})
        draft_serializer.is_valid(raise_exception=True)
        draft = draft_serializer.save()
        draft.refresh_from_db()
        assert draft.start_time == datetime(2026, 10, 1, 17, 30, tzinfo=timezone.utc)
        payload = {'name': draft.name, 'start_date': str(draft.start_date),
                   'start_time': DraftIssueSerializer(draft).data['start_time']}
        promote = IssueCreateSerializer(data=payload, context={
            'project_id': project.id, 'workspace_id': workspace.id, 'default_assignee_id': None,
        })
        promote.is_valid(raise_exception=True)
        promoted = promote.save()
        promoted.refresh_from_db()
        assert promoted.start_time == draft.start_time
        print('Isolated PostgreSQL: date-only, UTC save/read/clear and draft creation/promotion passed.')
        transaction.set_rollback(True)
