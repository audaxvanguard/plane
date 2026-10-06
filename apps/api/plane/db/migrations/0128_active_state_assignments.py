# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    states=schema_editor.quote_name(apps.get_model('db','State')._meta.db_table)
    schema_editor.execute(f"""
        CREATE FUNCTION plane_validate_active_state_assignment() RETURNS trigger AS $$
        BEGIN
            IF NEW.state_id IS NOT NULL THEN
                PERFORM 1 FROM {states}
                WHERE id=NEW.state_id AND project_id=NEW.project_id AND deleted_at IS NULL
                FOR SHARE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'State is unavailable or belongs to another project'
                    USING ERRCODE='23514';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    for model in ('Issue','DraftIssue'):
        table=schema_editor.quote_name(apps.get_model('db',model)._meta.db_table)
        schema_editor.execute(f"CREATE TRIGGER plane_active_state_assignment BEFORE INSERT OR UPDATE OF state_id, project_id ON {table} FOR EACH ROW EXECUTE FUNCTION plane_validate_active_state_assignment()")


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    for model in ('Issue','DraftIssue'):
        table=schema_editor.quote_name(apps.get_model('db',model)._meta.db_table)
        schema_editor.execute(f'DROP TRIGGER IF EXISTS plane_active_state_assignment ON {table}')
    schema_editor.execute('DROP FUNCTION IF EXISTS plane_validate_active_state_assignment()')


class Migration(migrations.Migration):
    dependencies=[('db','0127_issue_view_custom_configuration')]
    operations=[migrations.RunPython(install,uninstall)]
