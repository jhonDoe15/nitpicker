import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../test-support/fix-test-support.mts';
import { GUARDED_SAMPLES } from './test-support/guarded-samples.mts';
import { fixedSamples } from './test-support/sample-project.mts';

const { createGitRepository } = useGitFixtures();

const RULES = [...new Set(GUARDED_SAMPLES.map(({ rule }) => `eslint/${rule}`))];

describe('the upstream fixes a guard keeps only where they keep behaviour', () => {
  it('rewrites only the safe shapes with a plain --fix', () => {
    const { toolErrors, texts } = fixedSamples(createGitRepository, GUARDED_SAMPLES);

    expect(toolErrors).toEqual([]);
    expect(texts).toEqual(GUARDED_SAMPLES.map(({ plain }) => plain));
  });

  it('rewrites every shape when the rule is selected', () => {
    const { toolErrors, texts } = fixedSamples(createGitRepository, GUARDED_SAMPLES, {
      selectedRules: RULES,
    });

    expect(toolErrors).toEqual([]);
    expect(texts).toEqual(GUARDED_SAMPLES.map(({ selected }) => selected));
  });
});
