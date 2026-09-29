# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date, datetime, timezone
from django.test import SimpleTestCase
from plane.db.models import Issue
from plane.app.serializers.issue import IssueCreateSerializer, IssueSerializer


class OptionalDraftTimesTests(SimpleTestCase):
    def test_draft_time_is_preserved(self):
        from plane.db.models import DraftIssue
        from plane.app.serializers.draft import DraftIssueCreateSerializer
        serializer = DraftIssueCreateSerializer(DraftIssue(), data={
            'start_date': '2026-10-01', 'start_time': '2026-10-01T14:30:00-03:00',
        }, partial=True)
        serializer.is_valid(raise_exception=True)
        self.assertEqual(serializer.validated_data['start_time'], datetime(2026, 10, 1, 17, 30, tzinfo=timezone.utc))

    def test_draft_date_clear_removes_time(self):
        from plane.db.models import DraftIssue
        from plane.app.serializers.draft import DraftIssueCreateSerializer
        draft = DraftIssue(start_date=date(2026, 10, 1), start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        serializer = DraftIssueCreateSerializer(draft, data={'start_date': None}, partial=True)
        serializer.is_valid(raise_exception=True)
        self.assertIsNone(serializer.validated_data['start_time'])

    def test_draft_read_includes_optional_times(self):
        from plane.db.models import DraftIssue
        from plane.app.serializers.draft import DraftIssueSerializer
        self.assertIn('start_time', DraftIssueSerializer(DraftIssue()).data)
        self.assertIn('target_time', DraftIssueSerializer(DraftIssue()).data)


class OptionalIssueTimesTests(SimpleTestCase):
    def validate_patch(self, instance, data):
        serializer = IssueCreateSerializer(instance, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def test_fields_are_nullable_datetimes(self):
        for name in ('start_time', 'target_time'):
            field = Issue._meta.get_field(name)
            self.assertEqual(field.get_internal_type(), 'DateTimeField')
            self.assertTrue(field.null)
            self.assertTrue(field.blank)

    def test_date_only_remains_valid(self):
        data = self.validate_patch(Issue(), {'start_date': '2026-10-01'})
        self.assertEqual(data['start_date'], date(2026, 10, 1))
        self.assertIsNone(data.get('start_time'))

    def test_optional_time_preserves_offset_as_instant(self):
        data = self.validate_patch(Issue(), {'start_date': '2026-10-01', 'start_time': '2026-10-01T14:30:00-03:00'})
        self.assertEqual(data['start_time'], datetime(2026, 10, 1, 17, 30, tzinfo=timezone.utc))

    def test_time_requires_date(self):
        serializer = IssueCreateSerializer(Issue(), data={'start_time': '2026-10-01T12:00:00Z'}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('start_time', serializer.errors)

    def test_clear_time_keeps_date(self):
        issue = Issue(start_date=date(2026, 10, 1), start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        data = self.validate_patch(issue, {'start_time': None})
        self.assertIsNone(data['start_time'])
        self.assertNotIn('start_date', data)

    def test_clear_date_clears_time(self):
        issue = Issue(start_date=date(2026, 10, 1), start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        self.assertIsNone(self.validate_patch(issue, {'start_date': None})['start_time'])

    def test_date_change_without_time_clears_old_instant(self):
        issue = Issue(start_date=date(2026, 10, 1), start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        self.assertIsNone(self.validate_patch(issue, {'start_date': '2026-10-02'})['start_time'])

    def test_partial_update_checks_existing_other_date(self):
        serializer = IssueCreateSerializer(Issue(target_date=date(2026, 10, 1)), data={'start_date': '2026-10-02'}, partial=True)
        self.assertFalse(serializer.is_valid())

    def test_end_instant_cannot_precede_start(self):
        issue = Issue(start_date=date(2026, 10, 1), target_date=date(2026, 10, 1), start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        serializer = IssueCreateSerializer(issue, data={'target_time': '2026-10-01T11:00:00Z'}, partial=True)
        self.assertFalse(serializer.is_valid())

    def test_time_activity_records_value_and_clearing(self):
        from uuid import uuid4
        from plane.bgtasks.issue_activities_task import track_schedule_time
        activities = []
        track_schedule_time({'start_time': None}, {'start_time': '2026-10-01T12:00:00Z'},
                            uuid4(), uuid4(), uuid4(), uuid4(), activities, 1, field='start_time')
        self.assertEqual(len(activities), 1)
        self.assertEqual(activities[0].field, 'start_time')
        self.assertEqual(activities[0].new_value, '')

    def test_list_serializer_includes_times(self):
        issue = Issue(start_time=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))
        data = IssueSerializer(issue, fields=['start_time', 'target_time']).data
        self.assertIn('start_time', data)
        self.assertIsNone(data['target_time'])
