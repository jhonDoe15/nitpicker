import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createToolContext } from '../python-tools.mjs';
import {
  project as toolsProject,
  setEnvironment,
  temporaryRoot,
} from '../execution/test-support/python-tools-project.mjs';

const MUTATED =
  'def x_value__mutmut_orig():\n    return 1\n\n\ndef x_value__mutmut_1():\n    return 2\n\n\ndef x_value__mutmut_2():\n    return 3\n';

export function mutantsData(...exitCodes) {
  return JSON.stringify({
    'src/demo/a.py': {
      exitCodes: Object.fromEntries(
        exitCodes.map((code, index) => [`demo.a.x_value__mutmut_${String(index + 1)}`, code]),
      ),
      mutated: MUTATED,
    },
  });
}

export function project(files = {}) {
  return toolsProject({ 'src/demo/a.py': 'def value():\n    return 1\n', ...files });
}

export function contextFor(root, overrides = {}) {
  return createToolContext({
    projectRoot: root,
    liveRoot: root,
    reportRoot: temporaryRoot(),
    settings: { testRunner: 'pytest' },
    ...overrides,
  });
}

export function callsLog() {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}

export function mutmutCalls(calls) {
  return calls().filter(({ tool }) => tool === 'mutmut');
}
