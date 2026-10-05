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

    def _generated_dockerfile(self, target=None):
        from unittest.mock import patch
        files = []
        def capture(command):
            files.append(Path(command[command.index('-f') + 1]).read_text())
        with patch.object(deploy.safety, 'guarded_run', side_effect=capture):
            deploy.build_image('test-image', '.', 'apps/web/Dockerfile.web', 'test', target=target)
        return files[0]

    def test_typecheck_builds_dependencies_without_duplicate_app_bundle(self):
        content = self._generated_dockerfile(target='installer')
        self.assertIn('--filter=web^...', content)
        self.assertIn('--concurrency=1', content)
        self.assertIn('RAYON_NUM_THREADS=1', content)

    def test_release_still_builds_the_full_web_application(self):
        content = self._generated_dockerfile()
        self.assertIn('--filter=web', content)
        self.assertNotIn('--filter=web^...', content)

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
