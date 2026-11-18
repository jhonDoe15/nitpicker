import { describe, expect, it } from 'vitest';
import { decide } from '../../decide.mjs';
import { binary, name, not, number } from '../../test-support/build.mjs';
import { solverBudget } from '../budget.mjs';
import { decideSync, noteQuestions } from '../decide-sync.mjs';
import { decideAll } from './decide-pool.mjs';
import { decidedAhead } from './decided-ahead.mjs';

function questions(label) {
  const count = name(`${label}Count`);
  return [
    [[not(binary('>', count, number('10')))], binary('>', count, number('20'))],
    [[binary('>', count, number('20'))], binary('>', count, number('10'))],
    [[binary('>', count, number('10'))], binary('>', count, number('20'))],
    [[binary('<', count, number('0'))], binary('>', count, number('5'))],
  ];
}

function expectedOf(asked) {
  return Promise.all(asked.map(([conditions, query]) => decide(conditions, query)));
}

describe('decideAll', () => {
  it('answers a batch in the order asked, like decide', async () => {
    const asked = questions('batch');
    const requests = asked.map(([conditions, query]) => ({
      explain: false,
      conditions,
      query,
      options: {},
    }));

    expect(decideAll(requests, { workers: 3 })).toEqual(await expectedOf(asked));
  });
});

describe('decidedAhead', () => {
  it('notes the questions of a dry run as open without asking the solver', () => {
    const [[conditions, query]] = questions('noted');
    const answers = [];

    const noted = noteQuestions(() => answers.push(decideSync(conditions, query)));

    expect(answers).toEqual(['open']);
    expect(noted).toHaveLength(1);
  });

  it('gives the run the answers the solver gives, found on several threads', async () => {
    const asked = questions('ahead');
    const run = () => asked.map(([conditions, query]) => decideSync(conditions, query));

    expect(decidedAhead(run, { decisionWorkers: 3 })).toEqual(await expectedOf(asked));
  });

  it('still counts each answer found ahead against the budget of the run', () => {
    const asked = questions('budget');
    const run = () => {
      const budget = solverBudget(2);
      return asked.map(([conditions, query]) => decideSync(conditions, query, { budget }));
    };

    expect(decidedAhead(run, { decisionWorkers: 2 }).slice(2)).toEqual(['open', 'open']);
  });

  it('runs once, as asked, with one solver thread', () => {
    const runs = [];

    decidedAhead(() => runs.push('run'), { decisionWorkers: 1 });

    expect(runs).toEqual(['run']);
  });
});
