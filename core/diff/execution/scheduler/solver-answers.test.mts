import { existsSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solverAnswersOnce } from './solver-answers.mts';
import { runScheduler } from './run-scheduler.mts';
import { SOLVER_ANSWERS_ENVIRONMENT } from '../../../../shared/solver-answers/answer-store.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { fieldAt } from '../../../../scripts/json/fields.mts';

const REPORT_FOLDER_SCRIPT = `
const folder = process.env.${SOLVER_ANSWERS_ENVIRONMENT};
process.stdout.write(JSON.stringify({ findings: [{
  tool: process.argv[1], rule: 'probe', path: 'a.ts', identity: folder ?? 'unset',
  message: 'solver answers', classification: 'enforceable',
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
      args: ['-e', REPORT_FOLDER_SCRIPT, name],
      cwd: process.cwd(),
    },
  };
}

function folderSeenBy(name: string): string {
  const reports = fieldAt(runScheduler([probeTask(name)], undefined), 'reports');
  return textOf(fieldAt(reports, 0, 1, 'findings', 0, 'identity'));
}

describe('the solver answers folder of a process', () => {
  it('is one folder for every scheduler run, so the head run reads what the base run kept', () => {
    const base = folderSeenBy('base');
    const head = folderSeenBy('head');

    expect(base).not.toBe('unset');
    expect(head).toBe(base);
    expect(existsSync(base)).toBe(true);
  });

  it('is made on first use and named the same from then on', () => {
    const environment = solverAnswersOnce();
    const first = textOf(environment()[SOLVER_ANSWERS_ENVIRONMENT]);

    expect(existsSync(first)).toBe(true);
    expect(environment()).toEqual({ [SOLVER_ANSWERS_ENVIRONMENT]: first });
    rmSync(first, { recursive: true, force: true });
  });
});
