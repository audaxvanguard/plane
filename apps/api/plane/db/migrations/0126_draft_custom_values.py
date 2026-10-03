# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0125_project_custom_fields")]
    operations = [
        migrations.AddField(
            model_name="draftissue",
            name="custom_values",
            field=models.JSONField(blank=True, default=dict),
        )
    ]
