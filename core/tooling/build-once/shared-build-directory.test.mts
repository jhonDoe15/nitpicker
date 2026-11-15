import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARED_BUILD_DIRECTORY_ENVIRONMENT } from './build-once.mts';
import { textOf } from '../../../shared/values/readers.mts';
import { fieldAt, listOf } from '../../../scripts/json/fields.mts';
import { runScheduler } from '../../diff/execution/run-analyzers.mts';

const REPORT_DIRECTORY_SCRIPT = `
const directory = process.env.${SHARED_BUILD_DIRECTORY_ENVIRONMENT};
process.stdout.write(JSON.stringify({ findings: [{
  tool: process.argv[1], rule: 'probe', path: 'a.ts', identity: directory ?? 'unset',
  message: 'shared directory', classification: 'enforceable',
}] }));
`;

function probeTask(name: string) {
  return {
    name,
    dependencies: [],
    concurrencyWeight: 1,
    timeoutMs: 20_000,
    acceptedExitCodes: [0],
    invocation: {
      command: process.execPath,
      args: ['-e', REPORT_DIRECTORY_SCRIPT, name],
      cwd: process.cwd(),
    },
  };
}

describe('runScheduler shared build directory', () => {
  it('gives every analyzer of one run the same directory and removes it afterwards', () => {
    const reports = listOf(
      fieldAt(runScheduler([probeTask('first'), probeTask('second')], undefined), 'reports'),
    );

    const directories = reports.map((report) =>
      textOf(fieldAt(report, 1, 'findings', 0, 'identity')),
    );
    expect(reports.map((report) => textOf(fieldAt(report, 0))).sort()).toEqual(['first', 'second']);
    expect(directories[0]).not.toBe('unset');
    expect(directories[1]).toBe(directories[0]);
    expect(existsSync(textOf(directories[0]))).toBe(false);
  });

  it('uses a fresh directory for every run', () => {
    const first = fieldAt(
      runScheduler([probeTask('first')], undefined),
      'reports',
      0,
      1,
      'findings',
      0,
    );
    const second = fieldAt(
      runScheduler([probeTask('first')], undefined),
      'reports',
      0,
      1,
      'findings',
      0,
    );

    expect(fieldAt(second, 'identity')).not.toBe(fieldAt(first, 'identity'));
  });
});
