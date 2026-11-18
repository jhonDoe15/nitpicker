import { beforeAll, describe, expect, it } from 'vitest';
import { useGitFixtures } from '../test-support/fix-test-support.mts';
import { expectedText, fixedCorpus, type CorpusRun } from './test-support/corpus-project.mts';
import { probeOf, typeErrors } from './test-support/module-probes.mts';

const { createGitRepository } = useGitFixtures();

const SELECTED = [
  'eslint/@typescript-eslint/prefer-find',
  'eslint/@typescript-eslint/require-await',
  'eslint/@typescript-eslint/no-unnecessary-type-conversion',
  'eslint/no-unused-private-class-members',
  'eslint/no-useless-call',
  'eslint/no-useless-assignment',
];

function left(where: string, rule: string, reason: string): string {
  return `--fix left src/main/corpus/${where} eslint/${rule}: ${reason}`;
}

const DECLINED: Readonly<Record<string, readonly string[]>> = {
  plain: [
    left(
      'template.ts:6',
      'no-useless-concat',
      'a side is not a plain string or a template without expressions',
    ),
    [
      '--fix applied src/main/corpus/near-duplicates.ts:17 structure/near-duplicate',
      '(typescript-extract-near-duplicate): the literal values did not type-check as a union,',
      'so the shared function takes their base type',
    ].join(' '),
  ],
  selected: [
    left(
      'getters.ts:16',
      'no-useless-call',
      'the receiver is read twice and a read may run a getter, or this would change from null',
    ),
    left(
      'useless-assignment.ts:2',
      'no-useless-assignment',
      'the stored value may have effects, so removing it is for a person to decide',
    ),
  ],
};

const runs = new Map<string, CorpusRun>();

function runOf(name: string): CorpusRun {
  const run = runs.get(name);
  if (run === undefined) {
    throw new Error(`No corpus run ${name}`);
  }
  return run;
}

function changed(run: CorpusRun): string[] {
  return Object.keys(run.before).filter((name) => run.before[name] !== run.after[name]);
}

const SELECTIONS: Readonly<Record<string, readonly string[] | undefined>> = {
  plain: undefined,
  selected: SELECTED,
};

describe.each(['plain', 'selected'])('the %s --fix run over the hard-shape corpus', (name) => {
  beforeAll(() => {
    runs.set(name, fixedCorpus(createGitRepository, SELECTIONS[name]));
  });

  it('runs without tool errors and leaves a project that type-checks', () => {
    const run = runOf(name);

    expect(run.toolErrors).toEqual([]);
    expect(typeErrors(run.projectRoot)).toEqual([]);
  });

  it('rewrites each module into its expected form and leaves the rest as they were', () => {
    const run = runOf(name);
    const expected = Object.fromEntries(
      Object.keys(run.before).map((module) => [
        module,
        expectedText(name, module) ?? run.before[module],
      ]),
    );

    expect(run.after).toEqual(expected);
  });

  it('keeps what every changed module returns from probe()', async () => {
    const run = runOf(name);
    const pairs = await Promise.all(
      changed(run).map(async (module) => [
        module,
        await probeOf(run.before, module),
        await probeOf(run.after, module),
      ]),
    );

    expect(pairs.filter(([, before, after]) => before !== after)).toEqual([]);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('notes each shape a recipe declined', () => {
    const notes = runOf(name).notes.filter((note) => note.startsWith('--fix '));

    expect(notes).toEqual(DECLINED[name]);
  });
});
