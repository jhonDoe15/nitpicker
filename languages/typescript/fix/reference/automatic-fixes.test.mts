import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { readReferenceEntries as untypedReadReferenceEntries } from '../../../../shared/reference/store.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { fixOptions, topicRepository, useGitFixtures } from '../test-support/fix-test-support.mts';
import { AUTOMATIC_SAMPLES } from './test-support/automatic-samples.mts';

const { createGitRepository } = useGitFixtures();

const readReferenceEntries: () => readonly unknown[] = untypedReadReferenceEntries;

const LABELS = new Set(['maintainability', 'simplification']);

const COMMITTED = {
  'package.json': '{ "name": "demo", "type": "module" }\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
      target: 'ES2024',
      lib: ['ES2024'],
      types: [],
      noEmit: true,
      noUncheckedIndexedAccess: true,
    },
    include: ['src'],
  }),
};

function automaticRules(): string[] {
  return readReferenceEntries()
    .filter(
      (entry) =>
        fieldOf(entry, 'tool') === 'eslint' &&
        fieldOf(fieldOf(entry, 'fix'), 'typescript') === 'automatic' &&
        listOf(fieldOf(entry, 'labels')).some((label) => LABELS.has(textOf(label))),
    )
    .map((entry) => textOf(fieldOf(entry, 'rule')))
    .toSorted();
}

describe('the automatic fixes the rule reference lists', () => {
  it('has a sample for every automatic maintainability and simplification ESLint rule', () => {
    expect(Object.keys(AUTOMATIC_SAMPLES).toSorted()).toEqual(automaticRules());
  });

  it('rewrites every sample with a plain --fix', () => {
    const samples = Object.values(AUTOMATIC_SAMPLES);
    const repository = topicRepository(
      createGitRepository,
      COMMITTED,
      Object.fromEntries(samples.map(({ path: name, input }) => [name, input])),
    );
    const result = fixWorkingTree(fixOptions(repository.root));

    expect(result.toolErrors).toEqual([]);
    expect(
      Object.fromEntries(
        Object.entries(AUTOMATIC_SAMPLES).map(([rule, sample]) => [
          rule,
          readFileSync(path.join(repository.root, sample.path), 'utf8'),
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(AUTOMATIC_SAMPLES).map(([rule, { output }]) => [rule, output]),
      ),
    );
  });
});
