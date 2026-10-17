import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { kotlinConfig, useGradleFixtures } from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { kotlinRepository, run } = useGradleFixtures(nitpickerCli);

describe('nitpicker with "preset": "kotlin" configuration', () => {
  describe('exceptions for one-way rules', () => {
    const callRule = 'detekt.style.ForbiddenMethodCall';
    const forbidden =
      'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work. In a test, use `runTest`.';
    const withExceptions = (exceptions) => `${JSON.stringify({ preset: 'kotlin', exceptions })}\n`;
    const exception = {
      rule: callRule,
      paths: ['src/main/kotlin/demo/K.kt'],
      reason: 'The entry point blocks on its coroutine.',
    };
    const added = {
      'detekt.txt': `Legacy magic number\n${callRule} :: ${forbidden}\n`,
    };
    it('fails a new finding of a one-way rule and hands it the allowed form and the exception route', () => {
      const root = kotlinRepository();
      writeFiles(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(1);
      expect(result.json('new-findings.json')).toEqual([
        {
          tool: 'detekt',
          rule: callRule,
          path: 'src/main/kotlin/demo/K.kt',
          identity: `fp:nitpicker/subject=${forbidden}`,
          location: { line: 4 },
          message: `${forbidden} If a reviewer agrees this is intended, add {"rule":"${callRule}","paths":["src/main/kotlin/demo/K.kt"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.`,
          classification: 'enforceable',
        },
      ]);
    });
    it('passes the same change when nitpicker.config.json lists an exception for the path', () => {
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([exception]) });
      writeFiles(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.text).toBe(0);
    });
    it('does not lift the rule for another path', () => {
      const other = { ...exception, paths: ['src/main/kotlin/other/**'] };
      const root = kotlinRepository({ 'nitpicker.config.json': withExceptions([other]) });
      writeFiles(root, added);
      commit(root, 'add a forbidden call');

      const result = run(root, [], { subprocess: true });

      expect(result.exitCode, result.text).toBe(1);
    });
    it('rejects an exception for a rule that is not a one-way rule', () => {
      const root = kotlinRepository({
        'nitpicker.config.json': withExceptions([
          { ...exception, rule: 'detekt.style.MagicNumber' },
        ]),
      });

      const result = run(root);

      expect(result.exitCode).toBe(2);
      expect(result.output.err).toBe(
        'nitpicker failed: nitpicker.config.json: "exceptions[0].rule" is "detekt.style.MagicNumber", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: detekt.potential-bugs.UnsafeCallOnNullableType, detekt.potential-bugs.CastNullableToNonNullableType, detekt.coroutines.GlobalCoroutineUsage, detekt.style.ForbiddenMethodCall, detekt.style.UnnecessaryLet, detekt.style.UnnecessaryApply, detekt.style.UseLet, detekt.style.UseDataClass, detekt.style.DataClassShouldBeImmutable, function-lines-limit, function-statements-limit, function-control-nesting-limit, function-parameters-limit, crap-score-limit, crap-coverage-unknown, changed-branch-coverage, mutant-survived, mutant-nocoverage, duplicate-clone, stability-direction, file-lines-limit, folder-files-limit, test-runtime/slow-test, and, for the Java sources of the project, a finding as it is printed, "<tool>/<rule>" (for example "pmd/UnusedPrivateField"; tools: pmd, spotbugs, errorprone, archunit, google-java-format, jacoco, checkstyle, crap, duplicates, pit, structure, coupling, spring, test-runtime). Tune any other detekt rule in config/detekt/detekt.yml\n',
      );
    });
  });
  it.each([undefined, 'none'])(
    'runs no format check for a project without a detected formatter (kotlin.formatter %s)',
    (formatter) => {
      const root = kotlinRepository({ 'nitpicker.config.json': kotlinConfig(formatter) });
      writeFiles(root, {
        'ktlint.txt': 'standard:no-wildcard-imports|Wildcard import\n',
        'kotlin-format.txt': 'src/main/kotlin/demo/K.kt\n',
      });
      commit(root, 'violate every formatter');

      const result = run(root);

      expect(result.exitCode, result.text).toBe(0);
    },
  );
  it('reports a raised legacy allowance under the kotlin analyzer', () => {
    const inventory = (count) =>
      `${JSON.stringify({
        sites: [
          {
            file: 'src/main/kotlin/demo/K.kt',
            rule: 'detekt.style.MagicNumber',
            source: 'fp:nitpicker/subject=Legacy magic number',
            count,
          },
        ],
      })}\n`;
    const root = kotlinRepository({ 'nitpicker.legacy.json': inventory(1) });
    writeFiles(root, { 'nitpicker.legacy.json': inventory(2) });
    commit(root, 'raise the allowance');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'kotlin',
        rule: 'baseline-expansion',
        path: 'src/main/kotlin/demo/K.kt',
        identity: 'site:fbe5622ec73235ebeafafa81',
        message: 'Legacy allowance increased from 1 to 2 for detekt.style.MagicNumber',
        classification: 'enforceable',
      },
    ]);
  });
});
