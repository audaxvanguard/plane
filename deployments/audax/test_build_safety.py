import unittest
import json
from pathlib import Path
from unittest.mock import Mock, patch
import build_safety as safety

GIB = 1024**3


class BuildSafetyTests(unittest.TestCase):
    def test_memory_parser_uses_available_not_free(self):
        data = safety.parse_meminfo('MemTotal: 32000000 kB\nMemFree: 100000 kB\nMemAvailable: 12000000 kB\n')
        self.assertEqual(data['MemAvailable'], 12000000 * 1024)

    def test_missing_available_fails_closed(self):
        with self.assertRaises(ValueError):
            safety.parse_meminfo('MemFree: 1000 kB\n')

    def test_pressure_parser(self):
        self.assertEqual(safety.parse_pressure('some avg10=2.50 avg60=0.0 total=1\nfull avg10=0.25 total=1\n'), (2.5, 0.25))

    def test_start_requires_ten_gib_available(self):
        self.assertIsNotNone(safety.safety_problem(9 * GIB, (0, 0), starting=True))
        self.assertIsNone(safety.safety_problem(11 * GIB, (0, 0), starting=True))

    def test_running_aborts_below_six_gib_or_high_pressure(self):
        self.assertIsNotNone(safety.safety_problem(5 * GIB, (0, 0)))
        self.assertIsNotNone(safety.safety_problem(20 * GIB, (6, 0)))
        self.assertIsNotNone(safety.safety_problem(20 * GIB, (0, 2)))
        self.assertIsNone(safety.safety_problem(7 * GIB, (0, 0)))

    def test_dockerfile_constraints_are_build_only(self):
        source = 'FROM node AS installer\nRUN pnpm turbo run build --filter=web\nFROM node AS runner\nCMD ["node", "app"]\n'
        bounded = safety.bounded_dockerfile(source)
        self.assertIn('--concurrency=1', bounded)
        self.assertIn('RAYON_NUM_THREADS=1', bounded)
        self.assertIn('--max-old-space-size=2560', bounded)
        self.assertNotIn('ENV NODE_OPTIONS', bounded)
        self.assertTrue(bounded.endswith('FROM node AS runner\nCMD ["node", "app"]\n'))

    def test_compilers_disable_thp_without_changing_runtime(self):
        source = 'FROM node AS installer\nRUN pnpm turbo run build --filter=web\nFROM node AS runner\nCMD ["node", "app"]\n'
        bounded = safety.bounded_dockerfile(source)
        self.assertIn('COPY --from=audax-build-tools /audax-no-thp', bounded)
        self.assertIn('/usr/local/bin/audax-no-thp env NODE_OPTIONS=', bounded)
        self.assertTrue(bounded.endswith('FROM node AS runner\nCMD ["node", "app"]\n'))
        self.assertNotIn('transparent_hugepage', bounded)

    def test_thp_launcher_flag_survives_child_exec_and_propagates_exit(self):
        import tempfile
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as temp:
            binary = str(Path(temp) / 'no-thp')
            subprocess.run(['gcc', '-Wall', '-Werror', str(Path(__file__).with_name('no-thp.c')), '-o', binary], check=True)
            code = "import subprocess; print(subprocess.check_output(['grep','THP_enabled:','/proc/self/status'],text=True))"
            result = subprocess.run([binary, sys.executable, '-c', code], capture_output=True, text=True, check=True)
            self.assertIn('THP_enabled:\t0', result.stdout)
            self.assertEqual(subprocess.run([binary, '/bin/sh', '-c', 'exit 7']).returncode, 7)
            self.assertEqual(subprocess.run([binary], capture_output=True).returncode, 64)
            self.assertEqual(subprocess.run([binary, '/missing-command'], capture_output=True).returncode, 127)

    def test_reclaim_requests_only_build_file_cache(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / 'memory.stat').write_text('anon 900000000\nfile 2000000000\n')
            (directory / 'memory.reclaim').write_text('')
            safety.reclaim_build_cache(directory)
            self.assertEqual((directory / 'memory.reclaim').read_text(), '2000000000')

    def test_proactive_reclaim_only_cold_build_cache(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / 'memory.current').write_text(str(4 * GIB))
            (directory / 'memory.stat').write_text(f'anon {2 * GIB}\ninactive_file {GIB}\n')
            (directory / 'memory.reclaim').write_text('')
            safety.trim_build_cache(directory)
            self.assertEqual((directory / 'memory.reclaim').read_text(), str(256 * 1024**2))
            (directory / 'memory.reclaim').write_text('')
            (directory / 'memory.stat').write_text('inactive_file 1000\n')
            safety.trim_build_cache(directory)
            self.assertEqual((directory / 'memory.reclaim').read_text(), '')

    def test_compilers_are_serialized(self):
        source = 'RUN xcaddy build \\\n --with module\nRUN pip install -r requirements.txt\n'
        bounded = safety.bounded_dockerfile(source)
        self.assertIn('GOMAXPROCS=1', bounded)
        self.assertIn('GOFLAGS="-p=1"', bounded)
        self.assertIn('MAKEFLAGS=-j1 CARGO_BUILD_JOBS=1 pip install', bounded)

    def test_guard_refuses_before_spawning(self):
        with patch.object(safety, 'host_problem', return_value='Low memory'), patch.object(safety.subprocess, 'Popen') as spawn:
            with self.assertRaises(RuntimeError):
                safety.guarded_run(['heavy-build'])
            spawn.assert_not_called()

    def test_guard_stops_only_build_work_when_pressure_rises(self):
        process = Mock(pid=123)
        process.poll.return_value = None
        with patch.object(safety, 'host_problem', side_effect=[None, 'Pressure too high']), \
             patch.object(safety.subprocess, 'Popen', return_value=process), \
             patch.object(safety, 'abort_build_work') as abort, \
             patch.object(safety.time, 'sleep'):
            with self.assertRaises(RuntimeError):
                safety.guarded_run(['heavy-build'])
            abort.assert_called_once_with(process)

    def test_exit_failure_is_not_retried(self):
        process = Mock()
        process.poll.return_value = 137
        with patch.object(safety, 'host_problem', return_value=None), patch.object(safety.subprocess, 'Popen', return_value=process) as spawn:
            with self.assertRaises(safety.subprocess.CalledProcessError):
                safety.guarded_run(['heavy-build'])
            self.assertEqual(spawn.call_count, 1)

    def test_old_or_ignored_builder_limits_fail_closed(self):
        config = dict(Memory=safety.BUDGET, MemorySwap=safety.BUDGET,
                      CgroupParent='', CpuQuota=150000, CpuPeriod=100000)
        with patch.object(safety.subprocess, 'check_output', return_value=json.dumps([{'HostConfig': config, 'State': {'Pid': 0}}])):
            with self.assertRaises(RuntimeError):
                safety.verify_builder()
        config['CgroupParent'] = safety.SLICE
        config['MemorySwap'] = 20 * GIB
        with patch.object(safety.subprocess, 'check_output', return_value=json.dumps([{'HostConfig': config, 'State': {'Pid': 0}}])):
            with self.assertRaises(RuntimeError):
                safety.verify_builder()

    def test_running_builder_outside_shared_cgroup_is_rejected(self):
        config = dict(Memory=safety.BUDGET, MemorySwap=safety.BUDGET,
                      CgroupParent=safety.SLICE, CpuQuota=150000, CpuPeriod=100000)
        with patch.object(safety.subprocess, 'check_output', return_value=json.dumps([{'HostConfig': config, 'State': {'Pid': 123}}])), \
             patch.object(safety.Path, 'read_text', return_value='0::/system.slice/other.scope'), \
             patch.object(safety.Path, 'write_text'), patch.object(safety.os, 'setpriority'), \
             patch.object(safety.Path, 'iterdir', return_value=[]), patch.object(safety.subprocess, 'run'):
            with self.assertRaises(RuntimeError):
                safety.verify_builder()

    def test_correct_stopped_builder_is_accepted(self):
        config = dict(Memory=safety.BUDGET, MemorySwap=safety.BUDGET,
                      CgroupParent=safety.SLICE, CpuQuota=150000, CpuPeriod=100000)
        with patch.object(safety.subprocess, 'check_output', return_value=json.dumps([{'HostConfig': config, 'State': {'Pid': 0}}])):
            safety.verify_builder()

    def test_shared_policy_has_hard_limits_and_single_worker(self):
        directory = Path(__file__).parent
        config = (directory / 'audax-build.slice').read_text()
        for setting in ('MemoryMax=6G', 'MemoryHigh=4608M', 'MemorySwapMax=0', 'CPUQuota=150%', 'CPUWeight=1', 'IOWeight=1'):
            self.assertIn(setting, config)
        self.assertIn('max-parallelism = 1', (directory / 'buildkitd.toml').read_text())

    def test_protected_launcher_uses_low_priority_shared_unit(self):
        with patch.object(safety, 'host_problem', return_value=None), patch.object(safety.subprocess, 'run') as run:
            safety.launch_protected('build', '/safe/deploy.py')
            command = run.call_args.args[0]
            self.assertIn('--slice=audax-build.slice', command)
            self.assertIn('--property=Nice=19', command)
            self.assertIn('--property=IOSchedulingClass=idle', command)
            self.assertEqual(command[-1], '_build')

    def test_unreadable_monitor_fails_closed(self):
        with patch.object(safety.Path, 'read_text', side_effect=OSError('no telemetry')):
            self.assertIn('unavailable', safety.host_problem())

    def test_check_container_is_in_shared_slice_without_swap(self):
        command = safety.check_command('test-image', ['pnpm', 'check'])
        self.assertIn('--cgroup-parent=audax-build.slice', command)
        self.assertIn('--memory=4g', command)
        self.assertIn('--memory-swap=4g', command)
        self.assertIn('--cpus=1.5', command)
        self.assertIn('NODE_OPTIONS=--max-old-space-size=2560', command)


if __name__ == '__main__':
    unittest.main()
