import { describe, expect, it } from 'vitest';
import { JAVA_TOOLS } from '../../languages/java/adapters/gradle-presets.mjs';
import { SHARED_EXCEPTION_RULES } from '../../shared/policy.mjs';
import { JAVA_SIZE_RULES } from '../../shared/project-rules/size-rules.mjs';
import { validateConfig } from '../configuration/validate.mjs';

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
        `"exceptions[0].rule" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${[...SHARED_EXCEPTION_RULES, ...JAVA_SIZE_RULES].join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}`,
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

    const COVERAGE_TOOLS = {
      typescript: 'coverage',
      java: 'jacoco',
      kotlin: 'jacoco',
      python: 'coverage-py',
    };

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
              {
                ...coverage,
                rule: `${COVERAGE_TOOLS[preset]}/changed-branch-coverage`,
                function: undefined,
              },
            ],
          }),
        ).toThrow(
          `"exceptions[0].function" is required for ${COVERAGE_TOOLS[preset]}/changed-branch-coverage`,
        );
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
        '"exceptions[0].function" is only supported for these rules: function-lines-limit, function-statements-limit, function-control-nesting-limit, function-parameters-limit, crap-score-limit, crap-coverage-unknown, changed-branch-coverage, mutant-survived, mutant-nocoverage',
      );
      for (const blank of ['', '  ']) {
        expect(() => validateConfig({ exceptions: [{ ...coverage, function: blank }] })).toThrow(
          '"exceptions[0].function" must be a non-blank name',
        );
      }
    });

    it('accepts a function on a mutant rule and a name on an export or type of dead code', () => {
      const mutant = { ...coverage, rule: 'mutant-survived' };
      const unused = { ...coverage, rule: 'exports', function: undefined, name: 'unusedA' };

      expect(validateConfig({ exceptions: [mutant, unused] })).toEqual({
        exceptions: [mutant, unused],
      });
      expect(() => validateConfig({ exceptions: [{ ...unused, rule: 'files' }] })).toThrow(
        '"exceptions[0].name" is only supported for these rules: exports, types',
      );
      expect(() => validateConfig({ exceptions: [{ ...unused, function: 'save' }] })).toThrow(
        '"exceptions[0].function" is only supported for these rules',
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

  describe('what an entry may say', () => {
    const entry = {
      rule: 'function-lines-limit',
      paths: ['src/a.ts'],
      function: 'save',
      reason: 'A reviewed reason.',
    };
    const rejected = (override) => () =>
      validateConfig({ exceptions: [{ ...entry, ...override }] });

    it('rejects a tool prefix that is not the tool of the rule', () => {
      expect(rejected({ rule: 'bogus/function-lines-limit' })).toThrow(
        '"exceptions[0].rule" has an unknown tool prefix "bogus" for function-lines-limit: use the rule bare or as structure/function-lines-limit',
      );
      expect(() =>
        validateConfig({
          preset: 'python',
          exceptions: [{ ...entry, rule: 'jacoco/changed-branch-coverage' }],
        }),
      ).toThrow(
        '"exceptions[0].rule" has an unknown tool prefix "jacoco" for changed-branch-coverage: use the rule bare or as coverage-py/changed-branch-coverage',
      );
    });

    it.each(['...', ' ... ', '..', '…', '-', '', '   '])('rejects the reason %j', (reason) => {
      expect(rejected({ reason })).toThrow('"exceptions[0].reason" is');
    });

    it('accepts a reason that says something', () => {
      expect(() => rejected({ reason: 'Needed: 1 case' })()).not.toThrow();
    });

    it.each([
      ['/abs/a.ts', 'use a glob relative to the project root'],
      ['C:/a.ts', 'use a glob relative to the project root'],
      ['../a.ts', 'use a glob without `..`'],
      ['src/../a.ts', 'use a glob without `..`'],
      ['src\\a.ts', 'separate folders with "/"; a backslash only escapes one of { } [ ] , * ? \\'],
    ])('rejects the path %j', (glob, fix) => {
      expect(rejected({ paths: [glob] })).toThrow(`"exceptions[0].paths" has "${glob}": ${fix}`);
    });

    it('rejects an empty path', () => {
      expect(rejected({ paths: [' '] })).toThrow('"exceptions[0].paths" has an empty path glob');
    });

    it('accepts the escaped path a message prints', () => {
      expect(() => rejected({ paths: ['src/\\[id\\]/\\{x\\}/a.ts'] })()).not.toThrow();
    });
  });

  describe('exceptions of the Python preset', () => {
    const pythonEntry = (rule, extra = {}) => ({
      rule,
      paths: ['src/a.py'],
      reason: 'A reviewed reason.',
      ...extra,
    });

    it('keeps function and file rules in the top-level list and every other rule in python.exceptions', () => {
      const top = pythonEntry('function-lines-limit', { function: 'Service.run' });
      const nested = pythonEntry('T201');

      expect(
        validateConfig({
          preset: 'python',
          exceptions: [top],
          python: { exceptions: [nested] },
        }),
      ).toEqual({ preset: 'python', exceptions: [top], python: { exceptions: [nested] } });
    });

    it.each(['function-lines-limit', 'changed-branch-coverage', 'file-lines-limit', 'slow-test'])(
      'rejects %s in python.exceptions',
      (rule) => {
        expect(() =>
          validateConfig({
            preset: 'python',
            python: { exceptions: [pythonEntry(rule, { function: 'run' })] },
          }),
        ).toThrow(
          `"python.exceptions[0].rule" is "${rule}", a rule that every preset reports with a function or a path: lift it in the top-level "exceptions" instead`,
        );
      },
    );

    it('rejects a ruff rule in the top-level exceptions', () => {
      expect(() => validateConfig({ preset: 'python', exceptions: [pythonEntry('T201')] })).toThrow(
        '"exceptions" is not supported with "preset": "python"',
      );
    });

    it('reads a function rule printed as <tool>/<rule> in the top-level list, and rejects it in the other', () => {
      expect(() =>
        validateConfig({
          preset: 'python',
          exceptions: [pythonEntry('structure/function-lines-limit', { function: 'run' })],
        }),
      ).not.toThrow();
      expect(() =>
        validateConfig({
          preset: 'python',
          python: {
            exceptions: [pythonEntry('structure/function-lines-limit', { function: 'run' })],
          },
        }),
      ).toThrow('"python.exceptions[0].rule" is "structure/function-lines-limit"');
    });
  });

  describe('exceptions of the Java and Kotlin presets', () => {
    const printed = (rule) => ({ rule, paths: ['src/main/java/a/A.java'], reason: 'A reason.' });

    it.each(['java', 'kotlin'])('accept %s findings of every tool as printed', (preset) => {
      const exceptions = JAVA_TOOLS.map((tool) => printed(`${tool}/SomeRule`));

      expect(validateConfig({ preset, exceptions }).exceptions).toEqual(exceptions);
    });

    it.each(['java', 'kotlin'])('reject a bare tool and an unknown tool in %s', (preset) => {
      for (const rule of ['pmd/', 'pmd', 'bogus/Rule']) {
        expect(() => validateConfig({ preset, exceptions: [printed(rule)] })).toThrow(
          `"exceptions[0].rule"`,
        );
      }
    });

    it.each(['java', 'kotlin'])('reject a Checkstyle check named by its class in %s', (preset) => {
      expect(() =>
        validateConfig({
          preset,
          exceptions: [
            printed(
              'checkstyle/com.puppycrawl.tools.checkstyle.checks.naming.AbbreviationAsWordInNameCheck',
            ),
          ],
        }),
      ).toThrow('findings print the check\'s name, so write "checkstyle/AbbreviationAsWordInName"');
    });

    it.each(['java', 'kotlin'])('reject a Java finding whose paths are Kotlin in %s', (preset) => {
      expect(() =>
        validateConfig({
          preset,
          exceptions: [{ ...printed('pmd/UnusedPrivateField'), paths: ['src/main/kotlin/A.kt'] }],
        }),
      ).toThrow('which is reported in .java files only');
    });
  });
});
