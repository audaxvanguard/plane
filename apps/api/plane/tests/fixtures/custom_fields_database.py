# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Fast empty historical baseline, then real candidate migrations.

The installed baseline's old data migrations are not under test here. Never use
this plugin with production settings or an existing database.
"""
import pytest
from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder


@pytest.fixture(scope="session")
def django_db_setup(django_test_environment, django_db_blocker):
    expected = {
        "HOST": "test-db",
        "NAME": "plane_custom_fields_test",
        "USER": "cf_test",
    }
    if settings.SETTINGS_MODULE != "plane.settings.custom_fields_test" or any(
        connection.settings_dict[key] != value for key, value in expected.items()
    ):
        raise RuntimeError(
            "Refusing to bootstrap a database outside the isolated CRM test settings."
        )
    with django_db_blocker.unblock():
        if connection.introspection.table_names():
            raise RuntimeError("Bootstrap requires a fresh private test database.")
        executor = MigrationExecutor(connection)
        targets = [
            node for node in executor.loader.graph.leaf_nodes() if node[0] != "db"
        ]
        targets.append(("db", "0124_draft_optional_times"))
        state = executor.loader.project_state(targets)
        with connection.schema_editor() as editor:
            for model in state.apps.get_models():
                if model._meta.can_migrate(connection):
                    editor.create_model(model)
        recorder = MigrationRecorder(connection)
        applied = set()
        for target in targets:
            applied.update(executor.loader.graph.forwards_plan(target))
        for app, name in sorted(applied):
            recorder.record_applied(app, name)
        # Real feature migrations, including any new data migration, execute
        # normally. This is not --nomigrations or syncdb on the candidate models.
        call_command("migrate", interactive=False, verbosity=0)
    yield
    connection.close()
