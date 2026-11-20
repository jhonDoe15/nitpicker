import { describe, expect, it } from 'vitest';
import { carriedPassNotes, withCarriedTools } from './carried-reports.mts';
import { productionLayout } from '../../../preset/eslint-config/typed/policy-views.mts';
import { CARRIED_VARIABLE } from '../../../preset/eslint-config/production/carried-policies.mts';

function finding(tool: string, rule: string, path = 'src/main/a.ts') {
  return { tool, rule, path, identity: rule, message: rule, classification: 'enforceable' };
}

describe('findings of analyzers carried by eslint-lint', () => {
  it('names the carried analyzer on the findings of its rules', () => {
    const findings = [
      finding('eslint-lint', 'nitpicker/no-silent-catch'),
      finding('eslint-lint', 'nitpicker/no-production-console'),
      finding('eslint-lint', 'nitpicker/report-module-load-effects'),
      finding('eslint-lint', 'no-empty'),
    ];

    const carried = withCarriedTools(findings, {
      [CARRIED_VARIABLE]: 'eslint-errors,eslint-logging',
    });

    expect(carried.map(({ tool }) => tool)).toEqual([
      'eslint-errors',
      'eslint-logging',
      'eslint-lint',
      'eslint-lint',
    ]);
    expect(withCarriedTools(findings, {})).toEqual(findings);
  });

  it('gives each carried analyzer the notes of the pass about its files', () => {
    const findings = [
      finding('eslint-lint', 'no-empty'),
      finding('eslint-lint', 'eslint/inline-config-disabled'),
      finding('eslint-lint', 'unparsed-file'),
      finding('eslint-lint', 'rule-crashed'),
      finding('eslint-lint', 'eslint/unused-disable-directive', 'src/main/a.test.ts'),
    ];

    const notes = carriedPassNotes(
      findings,
      { [CARRIED_VARIABLE]: 'eslint-errors,eslint-logging' },
      productionLayout,
    );

    expect(notes.map(({ tool, rule, path }) => [tool, rule, path])).toEqual(
      ['eslint-errors', 'eslint-logging'].flatMap((tool) => [
        [tool, 'eslint/inline-config-disabled', 'src/main/a.ts'],
        [tool, 'unparsed-file', 'src/main/a.ts'],
        [tool, 'rule-crashed', 'src/main/a.ts'],
      ]),
    );
    expect(carriedPassNotes(findings, {}, productionLayout)).toEqual([]);
  });
});
