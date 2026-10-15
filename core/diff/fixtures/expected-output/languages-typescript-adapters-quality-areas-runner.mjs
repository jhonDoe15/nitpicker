import { expect } from 'vitest';
export function expectedOutput73_22() {
  return [
    {
      tool: 'crap',
      rule: 'tests-failed-skipped',
      path: '.',
      identity: 'tests-failed-skipped',
      message: 'CRAP did not run: there is no coverage report, because the project tests fail.',
      classification: 'tool-error',
    },
  ];
}
