import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTests(unittest.TestCase):
    def test_rewrites_only_application_images(self):
        text = 'services:\n  api:\n    image: upstream/api:stable\n    environment:\n      SECRET: keep-me\n  plane-db:\n    image: postgres:15\n'
        result = deploy.replace_images(text, {'api': 'local/api:abc'})
        self.assertIn('image: local/api:abc', result)
        self.assertIn('SECRET: keep-me', result)
        self.assertIn('image: postgres:15', result)

    def test_missing_service_fails_closed(self):
        with self.assertRaises(ValueError):
            deploy.replace_images('services:\n  api:\n    image: old\n', {'web': 'new'})

    def test_duplicate_image_fails_closed(self):
        with self.assertRaises(ValueError):
            deploy.replace_images('services:\n  api:\n    image: old\n    image: other\n', {'api': 'new'})

    def test_shared_backend_tag(self):
        images = deploy.image_map('abc123')
        self.assertEqual(images['api'], images['worker'])
        self.assertEqual(images['api'], images['migrator'])
        self.assertEqual(len(images), 9)
        self.assertTrue(all(v.endswith(':abc123') for v in images.values()))

    def test_atomic_write_preserves_permissions(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'compose.yml'
            p.write_text('old')
            p.chmod(0o600)
            deploy.atomic_write(p, 'new')
            self.assertEqual(p.read_text(), 'new')
            self.assertEqual(p.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
