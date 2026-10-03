import unittest
from unittest.mock import patch
from pathlib import Path
import subprocess
import json
import run_custom_fields_tests as runner


class HarnessTests(unittest.TestCase):
    def test_production_database_refused(self):
        for url in ('postgresql://plane:dummy@plane-db:5432/plane',
                    'postgresql://u:p@localhost/plane_custom_fields_test',
                    'postgresql://u:p@test-db/plane',
                    'postgresql://u:p@test-db:5433/plane_custom_fields_test'):
            with self.assertRaises(RuntimeError):
                runner.assert_test_database(url)

    def test_only_private_test_database_allowed(self):
        runner.assert_test_database(runner.TEST_DATABASE_URL)

    def test_all_services_share_slice_and_disable_swap(self):
        config=json.loads(subprocess.check_output(['docker','compose','-f',str(runner.COMPOSE),'--profile','extras','config','--format','json'],text=True,env=runner.compose_env()))
        self.assertEqual(set(config['services']), {'test-db','test-redis','test-mq','test-minio','api-tests'})
        for name,service in config['services'].items():
            self.assertEqual(service['cgroup_parent'],'audax-build.slice',name)
            self.assertEqual(service['mem_limit'],service['memswap_limit'],name)
            self.assertLessEqual(float(service['cpus']),1.5,name)
            self.assertNotIn('ports',service,name)
            self.assertNotIn('build',service,name)
            for mount in service.get('volumes',[]):
                if mount['type']=='bind':
                    self.assertTrue(mount.get('read_only'),name)
                    self.assertTrue(mount['source'].startswith(str(runner.ROOT)),name)
        self.assertEqual(int(config['services']['api-tests']['mem_limit']),3*1024**3)
        self.assertEqual(int(config['services']['test-db']['mem_limit']),1024**3)
        self.assertEqual(config['services']['api-tests']['environment']['DATABASE_URL'],runner.TEST_DATABASE_URL)

    def test_compose_uses_only_private_project(self):
        command=runner.compose_command('down','--volumes')
        self.assertIn('audax-custom-fields-test',command)
        self.assertIn(str(runner.COMPOSE),command)
        self.assertNotIn('/docker/plane-ql3x/docker-compose.yml',command)

    def test_checks_only_start_after_builder_stops(self):
        events=[]
        with patch.object(runner,'ensure_test_image',side_effect=lambda:events.append('image')), \
             patch.object(runner.safety,'cleanup_build_containers',side_effect=lambda:events.append('stop-builder')), \
             patch.object(runner,'guarded_compose',side_effect=lambda *args:events.append(args[0])), \
             patch.object(runner,'verify_test_containers'):
            runner.run_api_tests(['-q'])
        self.assertLess(events.index('stop-builder'),events.index('up'))
        self.assertEqual(events[-1],'down')

    def test_failure_still_tears_down_private_stack(self):
        def command(*args):
            if args[0]=='run':
                raise RuntimeError('failing test')
        with patch.object(runner,'ensure_test_image'),patch.object(runner.safety,'cleanup_build_containers'), \
             patch.object(runner,'guarded_compose',side_effect=command) as calls,patch.object(runner,'verify_test_containers'):
            with self.assertRaises(RuntimeError):
                runner.run_api_tests(['bad-test'])
            self.assertEqual(calls.call_args.args[0],'down')

    def test_no_prod_env_file_or_build_inside_compose(self):
        text=runner.COMPOSE.read_text()
        self.assertNotIn('env_file:',text)
        self.assertNotIn('build:',text)
        self.assertNotIn('external:',text)

    def test_helper_unit_is_bounded(self):
        command=runner.protected_command('helpers', ['test.mjs'])
        self.assertIn('--property=MemoryMax=256M',command)
        self.assertIn('--property=MemorySwapMax=0',command)
        self.assertIn('--slice=audax-build.slice',command)

    def test_interrupt_is_failure_not_systemd_clean_sigint(self):
        with self.assertRaises(RuntimeError):
            runner.handle_interrupt(15, None)

    def test_helper_path_cannot_escape_source(self):
        with self.assertRaises(RuntimeError):
            runner.helper_path('/tmp/outside.mjs')


if __name__=='__main__':
    unittest.main()
