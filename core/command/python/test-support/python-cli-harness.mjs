import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { installFakeToolchain } from '../../../../languages/python/adapters/test-support/fake-toolchain.mjs';
import { usePresetFixtures } from '../../test-support/preset-fixtures.mjs';

export const LEGACY_VIOLATION = 'F401|src/demo/a.py|`os` imported but unused\n';

const PYTHON_TEMPLATE_FILES = {
  'nitpicker.config.json': '{ "preset": "python" }\n',
  '.gitignore': '.venv/\n',
  'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n',
  'src/demo/a.py': 'import os\n\n\ndef value():\n    return 1\n',
  'violations.txt': LEGACY_VIOLATION,
};

export function newFindings(result, rule) {
  return result.json('new-findings.json').filter((finding) => finding.rule === rule);
}

export function usePythonFixtures(runNitpickerCli) {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const fixtures = usePresetFixtures({
    runCli: runNitpickerCli,
    name: 'python',
    templateFiles: PYTHON_TEMPLATE_FILES,
    prepareRepository(root) {
      installFakeToolchain(path.join(root, '.venv/bin'));
    },
  });

  function callsLog() {
    const log = path.join(fixtures.temporaryRoot('nitpicker-python-log-'), 'calls.jsonl');
    writeFileSync(log, '');
    vi.stubEnv('FAKE_PYTHON_LOG', log);
    return () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  }

  return {
    temporaryRoot: fixtures.temporaryRoot,
    pythonRepository: (files = {}) => fixtures.repository(files),
    run: fixtures.run,
    callsLog,
  };
}
