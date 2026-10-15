import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARED_BUILD_DIRECTORY_ENVIRONMENT } from './build-once.mjs';
import { runScheduler } from '../../diff/execution/run-analyzers.mjs';

const REPORT_DIRECTORY_SCRIPT = `
const directory = process.env.${SHARED_BUILD_DIRECTORY_ENVIRONMENT};
process.stdout.write(JSON.stringify({ findings: [{
  tool: process.argv[1], rule: 'probe', path: 'a.ts', identity: directory ?? 'unset',
  message: 'shared directory', classification: 'enforceable',
}] }));
`;

function probeTask(name) {
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
    const { reports } = runScheduler([probeTask('first'), probeTask('second')], undefined);

    const directories = reports.map(([, report]) => report.findings[0].identity);
    expect(reports.map(([name]) => name).sort()).toEqual(['first', 'second']);
    expect(directories[0]).not.toBe('unset');
    expect(directories[1]).toBe(directories[0]);
    expect(existsSync(directories[0])).toBe(false);
  });

  it('uses a fresh directory for every run', () => {
    const [[, first]] = runScheduler([probeTask('first')], undefined).reports;
    const [[, second]] = runScheduler([probeTask('first')], undefined).reports;

    expect(second.findings[0].identity).not.toBe(first.findings[0].identity);
  });
});
