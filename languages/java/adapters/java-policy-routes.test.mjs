import { describe, expect, it } from 'vitest';
import { applyJavaPolicy } from './java-policy.mjs';

const finding = (tool, file) => ({
  tool,
  rule: 'Rule',
  path: file,
  identity: 'id',
  message: 'Rule violated.',
  classification: 'enforceable',
});

describe('exception routes of applyJavaPolicy', () => {
  it('names an ArchUnit finding as <tool>/<rule> and leaves a PMD finding to the rule catalog', () => {
    const archunit = finding('archunit', 'src/main/java/app/A.java');
    const pmd = finding('pmd', 'src/main/java/app/B.java');

    expect(applyJavaPolicy([archunit, pmd], {})).toEqual([
      {
        ...archunit,
        message:
          'Rule violated. If this is intended, add {"rule":"archunit/Rule","paths":["src/main/java/app/A.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      },
      pmd,
    ]);
  });

  it('adds no route to a finding that an exception lifts', () => {
    const archunit = finding('archunit', 'src/main/java/app/A.java');

    expect(
      applyJavaPolicy([archunit], {
        exceptions: [{ rule: 'archunit/Rule', paths: ['src/main/java/app/**'] }],
      }),
    ).toEqual([]);
  });
});
