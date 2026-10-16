import { describe, expect, it } from 'vitest';
import { evaluateCoupling } from './evaluate-coupling.mjs';

const entry = {
  source: 'src/main/shared/format-price.ts',
  feature: 'billing',
  directory: 'src/main/features/billing/',
};

describe('shared-used-by-one-feature findings', () => {
  it('fails the shared module with the allowed form and the exception that lifts the rule', () => {
    const findings = evaluateCoupling({ sharedUsedByOneFeature: [entry] }, 'coupling', []);
    const exception = JSON.stringify({
      rule: 'shared-used-by-one-feature',
      paths: [entry.source],
      reason: '<why this is intended>',
    });

    expect(findings).toEqual([
      {
        tool: 'coupling',
        rule: 'shared-used-by-one-feature',
        path: 'src/main/shared/format-price.ts',
        identity: 'shared-used-by-one-feature',
        message: [
          'src/main/shared/format-price.ts is used only by feature billing.',
          'Move it into src/main/features/billing/.',
          `If a reviewer agrees this is intended, add ${exception} to "exceptions" in nitpicker.config.json.`,
        ].join(' '),
        classification: 'enforceable',
      },
    ]);
  });

  it('is lifted by an exception for the module path, and by no other rule or path', () => {
    const exception = {
      rule: 'shared-used-by-one-feature',
      paths: ['src/main/shared/**'],
      reason: 'x',
    };

    expect(evaluateCoupling({ sharedUsedByOneFeature: [entry] }, 'coupling', [exception])).toEqual(
      [],
    );
    expect(
      evaluateCoupling({ sharedUsedByOneFeature: [entry] }, 'coupling', [
        { ...exception, rule: 'duplicate-definition' },
        { ...exception, paths: ['src/main/shared/other.ts'] },
      ]),
    ).toHaveLength(1);
  });

  it('adds nothing when the report has no such module', () => {
    expect(evaluateCoupling({}, 'coupling', [])).toEqual([]);
  });
});
