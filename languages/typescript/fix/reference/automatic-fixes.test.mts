import { describe, expect, it } from 'vitest';
import { readReferenceEntries as untypedReadReferenceEntries } from '../../../../shared/reference/store.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { useGitFixtures } from '../test-support/fix-test-support.mts';
import { AUTOMATIC_SAMPLES } from './test-support/automatic-samples.mts';
import { fixedSamples } from './test-support/sample-project.mts';

const { createGitRepository } = useGitFixtures();

const readReferenceEntries: () => readonly unknown[] = untypedReadReferenceEntries;

const LABELS = new Set(['maintainability', 'simplification']);

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
    const rules = Object.keys(AUTOMATIC_SAMPLES);
    const samples = Object.values(AUTOMATIC_SAMPLES);
    const { toolErrors, texts } = fixedSamples(createGitRepository, samples);

    expect(toolErrors).toEqual([]);
    expect(Object.fromEntries(rules.map((rule, index) => [rule, texts[index]]))).toEqual(
      Object.fromEntries(samples.map(({ output }, index) => [rules[index], output])),
    );
  });
});
