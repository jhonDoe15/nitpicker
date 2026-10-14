import { describe, expect, it } from 'vitest';
import { JAVA_TOOLS } from '../../languages/java/adapters/gradle-presets.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../shared/policy.mjs';
import { validateConfig } from '../config.mjs';

describe('config exceptions', () => {
  describe('java exceptions', () => {
    const exception = {
      rule: 'function-lines-limit',
      paths: ['src/main/java/app/Big.java'],
      function: 'Big.run',
      reason: 'A reviewed reason.',
    };

    it('accepts an exception for a structure, CRAP or coverage rule', () => {
      const coverage = { ...exception, rule: 'changed-branch-coverage' };

      expect(validateConfig({ preset: 'java', exceptions: [exception, coverage] })).toEqual({
        preset: 'java',
        exceptions: [exception, coverage],
      });
    });

    it('accepts the other rules nitpicker adds', () => {
      const entries = [
        'mutant-survived',
        'mutant-nocoverage',
        'duplicate-clone',
        'stability-direction',
        'file-lines-limit',
      ].map((rule) => ({ rule, paths: ['src/main/java/app/**'], reason: 'A reviewed reason.' }));

      expect(validateConfig({ preset: 'java', exceptions: entries })).toEqual({
        preset: 'java',
        exceptions: entries,
      });
    });

    it('names the rules that can be lifted when the rule is another one', () => {
      const other = { ...exception, rule: 'pmd.SomeRule' };

      expect(() => validateConfig({ preset: 'java', exceptions: [other] })).toThrow(
        `"exceptions[0].rule" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${SHARED_EXCEPTION_RULES.filter((rule) => !JAVA_NATIVE_RULES.includes(rule)).join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
      );
    });
  });

  describe('function exceptions', () => {
    const coverage = {
      rule: 'changed-branch-coverage',
      paths: ['src/a.ts'],
      function: 'save',
      reason: 'Defensive branch that cannot happen.',
    };

    it.each(['typescript', 'javascript', 'java', 'kotlin'])(
      'accepts a coverage exception with a function in the %s preset',
      (preset) => {
        expect(validateConfig({ preset, exceptions: [coverage] })).toEqual({
          preset,
          exceptions: [coverage],
        });
      },
    );

    it.each(['typescript', 'java', 'kotlin', 'python'])(
      'accepts a rule nitpicker adds named as it is printed in the %s preset',
      (preset) => {
        const printed = {
          ...coverage,
          rule: 'structure/function-lines-limit',
          function: 'Big.run',
        };

        expect(validateConfig({ preset, exceptions: [printed] })).toEqual({
          preset,
          exceptions: [printed],
        });
        expect(() =>
          validateConfig({
            preset,
            exceptions: [
              { ...coverage, rule: 'jacoco/changed-branch-coverage', function: undefined },
            ],
          }),
        ).toThrow('"exceptions[0].function" is required for jacoco/changed-branch-coverage');
      },
    );

    it('requires the function for changed-branch-coverage', () => {
      expect(() => validateConfig({ exceptions: [{ ...coverage, function: undefined }] })).toThrow(
        '"exceptions[0].function" is required for changed-branch-coverage: name the function whose uncovered branches are accepted. To accept a whole file, add it to "exclude"',
      );
    });

    it('rejects a function on a rule that is not scoped to functions, or an empty one', () => {
      expect(() =>
        validateConfig({ exceptions: [{ ...coverage, rule: 'nitpicker/no-throw' }] }),
      ).toThrow(
        '"exceptions[0].function" is only supported for these rules: function-lines-limit, function-statements-limit, function-control-nesting-limit, function-parameters-limit, crap-score-limit, crap-coverage-unknown, changed-branch-coverage',
      );
      expect(() => validateConfig({ exceptions: [{ ...coverage, function: '' }] })).toThrow(
        '"exceptions[0].function" must be a non-empty function name',
      );
    });

    it('allows a structure exception with or without a function', () => {
      const lines = { ...coverage, rule: 'function-lines-limit' };
      const whole = { ...lines, function: undefined };

      expect(validateConfig({ exceptions: [lines, whole] })).toEqual({
        exceptions: [lines, whole],
      });
    });
  });
});
