import { describe, expect, it } from 'vitest';
import { decide } from '../../decide.mts';
import { binary, name, not, number } from '../../test-support/build.mts';
import type { Term } from '../../typed/term-types.mts';
import { required } from '../../typed/term-parts.mts';
import type { Finding } from '../../../values/findings.mts';
import { solverBudget } from '../budget.mts';
import { decideSync, noteQuestions, settledAhead } from '../decide-sync.mts';
import { decideAll } from './decide-pool.mts';
import { decidedAhead } from './decided-ahead.mts';

function questions(label: string): [Term[], Term][] {
  const count = name(`${label}Count`);
  return [
    [[not(binary('>', count, number('10')))], binary('>', count, number('20'))],
    [[binary('>', count, number('20'))], binary('>', count, number('10'))],
    [[binary('>', count, number('10'))], binary('>', count, number('20'))],
    [[binary('<', count, number('0'))], binary('>', count, number('5'))],
  ];
}

function found(identity: string): Finding {
  return {
    tool: 'test',
    rule: 'test',
    path: 'test',
    identity,
    message: '',
    classification: 'test',
  };
}

function identitiesOf(findings: readonly Finding[]): string[] {
  return findings.map(({ identity }) => identity);
}

function expectedOf(asked: [Term[], Term][]): Promise<string[]> {
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
    const [conditions, query] = required(questions('noted')[0], 'question');
    const answers: string[] = [];

    const noted = noteQuestions(() => answers.push(decideSync(conditions, query)), {
      keepSettled: false,
    });

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

  it('does not repeat a part of the run that asked the solver nothing in the dry run', () => {
    const [conditions, query] = required(questions('settled')[0], 'question');
    const parts = { quiet: {}, asking: {} };
    const runs: string[] = [];
    function run(): Finding[][] {
      const quiet = settledAhead(parts.quiet, () => {
        runs.push('quiet');
        return [found('quiet')];
      });
      const asking = settledAhead(parts.asking, () => {
        runs.push('asking');
        return [found(decideSync(conditions, query))];
      });
      return [quiet, asking];
    }

    expect([
      decidedAhead(run, { decisionWorkers: 2 }).map((findings) => identitiesOf(findings)),
      runs,
      identitiesOf(
        settledAhead(parts.quiet, () => [found('run again after the answers are forgotten')]),
      ),
    ]).toEqual([
      [['quiet'], ['false']],
      ['quiet', 'asking', 'asking'],
      ['run again after the answers are forgotten'],
    ]);
  });

  it('keeps no result of a dry run that was not asked to', () => {
    const part = {};
    const runs: string[] = [];

    noteQuestions(
      () =>
        settledAhead(part, () => {
          runs.push('dry');
          return [];
        }),
      { keepSettled: false },
    );
    settledAhead(part, () => {
      runs.push('real');
      return [];
    });

    expect(runs).toEqual(['dry', 'real']);
  });

  it('runs once, as asked, with one solver thread', () => {
    const runs: string[] = [];

    decidedAhead(() => runs.push('run'), { decisionWorkers: 1 });

    expect(runs).toEqual(['run']);
  });
});
