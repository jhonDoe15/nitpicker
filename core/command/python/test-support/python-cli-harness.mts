import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import type { RunTaskOptions } from '../../../diff/execution/progress.mts';
import type {
  FakeCall,
  PresetRun,
  PythonFixtures,
  RunNitpickerCli,
} from '../../test-support/fixture-types.mts';
import { fakeCallOf } from '../../test-support/report-readers.mts';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import {
  installFakeToolchain,
  spawnFakeTools,
} from '../../../../languages/python/adapters/test-support/fake-toolchain.mts';
import { runTasksInProcess } from '../../../diff/execution/test-support/in-process-analyzers.mts';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mts';

export const LEGACY_VIOLATION = 'F401|src/demo/a.py|`os` imported but unused\n';

const PYTHON_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "python" }\n',
  '.gitignore': '.venv/\n',
  'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n',
  'src/demo/a.py': 'import os\n\n\ndef value():\n    return 1\n',
  'violations.txt': LEGACY_VIOLATION,
};

export function newFindings(result: Pick<PresetRun, 'json'>, rule: string): unknown[] {
  return listOf(result.json('new-findings.json')).filter(
    (finding) => fieldOf(finding, 'rule') === rule,
  );
}

function runTasksWithFakeTools(
  tasks: readonly object[],
  headPolicyFile: unknown,
  options: RunTaskOptions,
): unknown {
  return runTasksInProcess(tasks, headPolicyFile, { ...options, spawn: spawnFakeTools });
}

export function usePythonFixtures(runNitpickerCli: RunNitpickerCli): PythonFixtures {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const fixtures = usePresetFixtures({
    runCli: runNitpickerCli,
    name: 'python',
    templateFiles: PYTHON_TEMPLATE_FILES,
    runOptions: { runTasks: runTasksWithFakeTools },
    prepareRepository(root) {
      installFakeToolchain(path.join(root, '.venv/bin'));
    },
  });

  function callsLog(): () => FakeCall[] {
    const log = path.join(fixtures.temporaryRoot('nitpicker-python-log-'), 'calls.jsonl');
    writeFileSync(log, '');
    vi.stubEnv('FAKE_PYTHON_LOG', log);
    return () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => fakeCallOf(parseJson(line)));
  }

  return {
    temporaryRoot: fixtures.temporaryRoot,
    pythonRepository: (files: Readonly<Record<string, string>> = {}) => fixtures.repository(files),
    run: fixtures.run,
    callsLog,
  };
}
