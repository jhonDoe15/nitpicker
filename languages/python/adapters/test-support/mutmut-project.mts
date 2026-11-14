import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RecordedCall } from './typed/fake-call.mts';
import type { ContextExtras, Files } from './typed/project-types.mts';
import { parseCall } from './typed/json-views.mts';
import { createToolContext, type ToolContext } from './typed/tool-context.mts';
import {
  project as toolsProject,
  setEnvironment,
  temporaryRoot,
} from '../execution/test-support/python-tools-project.mts';

const MUTATED =
  'def x_value__mutmut_orig():\n    return 1\n\n\ndef x_value__mutmut_1():\n    return 2\n\n\ndef x_value__mutmut_2():\n    return 3\n';

export function mutantsData(...exitCodes: readonly number[]): string {
  return JSON.stringify({
    'src/demo/a.py': {
      exitCodes: Object.fromEntries(
        exitCodes.map((code, index) => [`demo.a.x_value__mutmut_${String(index + 1)}`, code]),
      ),
      mutated: MUTATED,
    },
  });
}

export function project(files: Files = {}): string {
  return toolsProject({ 'src/demo/a.py': 'def value():\n    return 1\n', ...files });
}

export function contextFor(root: string, overrides: ContextExtras = {}): ToolContext {
  return createToolContext({
    projectRoot: root,
    liveRoot: root,
    reportRoot: temporaryRoot(),
    settings: { testRunner: 'pytest' },
    ...overrides,
  });
}

export function callsLog(): () => RecordedCall[] {
  const log = path.join(temporaryRoot(), 'calls.jsonl');
  writeFileSync(log, '');
  setEnvironment('FAKE_PYTHON_LOG', log);
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => parseCall(line));
}

export function mutmutCalls(calls: () => readonly RecordedCall[]): RecordedCall[] {
  return calls().filter(({ tool }) => tool === 'mutmut');
}
