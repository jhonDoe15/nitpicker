import { describe, expect, it, vi } from 'vitest';
import { solverBudget } from '../budget.mjs';
import { binary, name, not, number } from '../../test-support/build.mjs';

type Bridge = typeof import('../decide-sync.mjs');

const count: unknown = name('count');
const conditions: unknown[] = [not(binary('>', count, number('10')))];
const query: unknown = binary('>', count, number('20'));
const question = JSON.stringify({ explain: false, conditions, query, options: {} });

async function processSharing(answers: Map<string, unknown>): Promise<Bridge> {
  vi.resetModules();
  const bridge = await import('../decide-sync.mjs');
  bridge.shareSolverAnswers({
    find: (id: string) => answers.get(id),
    keep: (id: string, result: unknown) => answers.set(id, result),
  });
  return bridge;
}

describe('solver answers shared by the processes of a run', () => {
  it('keeps the answer of a question under the terms asked', async () => {
    const answers = new Map<string, unknown>();
    const { decideSync } = await processSharing(answers);

    expect(decideSync(conditions, query)).toBe('false');
    expect([...answers]).toEqual([[question, 'false']]);
  });

  it('takes a shared answer instead of asking the solver, and does not keep it again', async () => {
    const answers = new Map<string, unknown>([[question, 'stored']]);
    const keep = vi.spyOn(answers, 'set');
    const { decideSync } = await processSharing(answers);

    expect(decideSync(conditions, query)).toBe('stored');
    expect(keep).not.toHaveBeenCalled();
  });

  it('counts a shared answer against the budget like an asked one', async () => {
    const { decideSync } = await processSharing(new Map([[question, 'stored']]));
    const spent = solverBudget(0);
    const budget = solverBudget(1);

    expect([
      decideSync(conditions, query, { budget: spent }),
      decideSync(conditions, query, { budget }),
      budget,
    ]).toEqual(['open', 'stored', { left: 0 }]);
  });

  it('notes no question a shared answer settles when questions are answered ahead', async () => {
    const { decideSync, noteQuestions } = await processSharing(new Map([[question, 'stored']]));

    expect(
      noteQuestions(() => {
        decideSync(conditions, query);
      }),
    ).toEqual([]);
  });

  it('keeps no answer the solver failed on, so a later process asks again', async () => {
    const answers = new Map<string, unknown>();
    const { decideSync } = await processSharing(answers);
    const broken: unknown = { kind: 'no such term' };

    expect(decideSync([], broken, { integers: true })).toBe('open');
    expect([...answers]).toEqual([]);
  });

  it('asks the solver as before when no answers are shared', async () => {
    vi.resetModules();
    const { decideSync } = await import('../decide-sync.mjs');

    expect(decideSync(conditions, query)).toBe('false');
  });
});
