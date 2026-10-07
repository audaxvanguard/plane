# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
import unittest
from pathlib import Path
import run_editable_views_acceptance as acceptance


class AcceptanceIsolationTests(unittest.TestCase):
    def test_revision_is_exact_not_shell_or_latest(self):
        self.assertEqual(acceptance.validate_revision('5649cd5a0f6e'), '5649cd5a0f6e')
        for value in ('latest', 'HEAD', '5649cd5a', 'a'*13, 'abc;rm -rf /'):
            with self.assertRaises(ValueError): acceptance.validate_revision(value)

    def test_compiled_stack_is_local_bounded_and_not_source_mounted(self):
        config = acceptance.override('5649cd5a0f6e', Path('/private/seed.py'), Path('/private/nginx.conf'))
        self.assertIn('127.0.0.1:15017:80', config)
        self.assertIn('volumes: !reset []', config)
        self.assertNotIn(':/code', config)
        self.assertIn('memswap_limit: 1g', config)
        self.assertIn('audax-build.slice', config)
        self.assertIn('plane-backend:5649cd5a0f6e', config)
        self.assertIn('plane-web:5649cd5a0f6e', config)

    def test_seed_refuses_production_database_and_has_no_fixed_session(self):
        source = (acceptance.ROOT/'deployments/audax/editable-views-app-seed.py').read_text()
        self.assertIn("connection.settings_dict['HOST'] == 'test-db'", source)
        self.assertIn("connection.settings_dict['NAME'] == 'plane_custom_fields_test'", source)
        self.assertIn('SessionStore()', source)


if __name__ == '__main__': unittest.main()
