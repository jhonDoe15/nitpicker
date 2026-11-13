import { describe, expect, it } from 'vitest';
import { buildFixPlans } from './build-fix-plans.mjs';
import { defineBuilders } from './registry.mjs';
import { SIZE_CASES } from './test-support/size-cases.mjs';
import { COVERAGE_CASES } from './test-support/coverage-cases.mjs';
import { DESIGN_CASES } from './test-support/design-cases.mjs';
import { enforceable, filesEnvironment } from './test-support/env.mjs';
import { indexEntries } from '../reference/store.mjs';
import { ruleEntry } from '../reference/entry.mjs';

const ENTRIES = [
  ['structure', 'function-lines-limit'],
  ['structure', 'function-control-nesting-limit'],
  ['structure', 'function-parameters-limit'],
  ['structure', 'file-lines-limit'],
  ['structure', 'class-methods-limit'],
  ['structure', 'inheritance-depth-limit'],
  ['structure', 'folder-files-limit'],
  ['structure', 'sibling-copy-edit'],
  ['coverage', 'changed-branch-coverage', ['jacoco']],
  ['crap', 'crap-score-limit'],
  ['crap', 'crap-coverage-unknown'],
  ['mutation', 'mutant-survived', ['pit']],
  ['mutation', 'mutant-nocoverage', ['pit']],
  ['duplicates', 'duplicate-clone'],
  ['coupling', 'stability-direction'],
  ['coupling', 'feature-cycle'],
  ['coupling', 'shared-used-by-one-feature'],
  ['test-runtime', 'no-production-runtime'],
  ['eslint', 'nitpicker/no-handwritten-boundary-guard', ['eslint-lint']],
  ['eslint', 'no-console', ['eslint-lint']],
  ['archunit', 'spring-layout'],
].map(([tool, rule, findingTools]) =>
  ruleEntry({ tool, rule, page: 'p', analyzers: { java: ['java'] }, summary: 's', findingTools }),
);

const INDEX = indexEntries(ENTRIES);

const CASES = [...SIZE_CASES, ...COVERAGE_CASES, ...DESIGN_CASES];

function plans(findings, files = {}) {
  return buildFixPlans(findings, { index: INDEX, env: filesEnvironment(files) });
}

describe('buildFixPlans', () => {
  it.each(CASES)('%s', (_name, finding, files, expected) => {
    expect(plans([enforceable(finding)], files)).toEqual([expected]);
  });

  it('writes no plan for third-party lint, descriptive findings and unknown rules', () => {
    const own = { path: 'a.ts', location: { line: 1 }, message: 'm' };

    expect(
      plans([
        enforceable({ ...own, tool: 'eslint-lint', rule: 'no-console' }),
        enforceable({ ...own, tool: 'x', rule: 'unknown' }),
        {
          ...enforceable({ ...own, tool: 'structure', rule: 'file-lines-limit' }),
          classification: 'descriptive',
        },
      ]),
    ).toEqual([]);
  });

  it('skips a finding whose builder fails', () => {
    const builders = defineBuilders([
      {
        id: 'broken',
        rules: [{ tool: 'structure', rule: 'file-lines-limit' }],
        presets: ['java'],
        build: () => {
          throw new Error('boom');
        },
      },
    ]);
    const finding = enforceable({ tool: 'structure', rule: 'file-lines-limit', path: 'a.ts' });

    expect(buildFixPlans([finding], { index: INDEX, env: filesEnvironment({}), builders })).toEqual(
      [],
    );
  });
});
