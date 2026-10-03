# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.core.management import call_command


@pytest.mark.django_db(transaction=True)
def test_empty_database_backward_forward_and_no_pending_migrations():
    tables = {
        "project_custom_fields",
        "project_custom_field_options",
        "issue_custom_field_values",
    }
    executor = MigrationExecutor(connection)
    assert tables.issubset(connection.introspection.table_names())
    executor.migrate([("db", "0124_draft_optional_times")])
    assert tables.isdisjoint(connection.introspection.table_names())
    executor = MigrationExecutor(connection)
    executor.migrate([("db", "0125_project_custom_fields")])
    assert tables.issubset(connection.introspection.table_names())
    from plane.db.models import Issue, DraftIssue, IssueView, ProjectCustomField

    assert Issue._meta.get_field("start_time").null
    assert DraftIssue._meta.get_field("target_time").null
    assert not ProjectCustomField.objects.exists()
    assert IssueView._meta.get_field("filters").default() == {}
    call_command("makemigrations", "db", check=True, dry_run=True, verbosity=0)
    call_command("check", verbosity=0)
