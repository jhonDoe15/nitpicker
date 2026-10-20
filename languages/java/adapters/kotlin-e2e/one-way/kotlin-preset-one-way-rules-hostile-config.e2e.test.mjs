import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kotlinRuleCases } from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import { SUPPRESSION_RULE } from '../../kotlin/rules/kotlin-rules.mjs';
import { detektFindingsOf, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  const fixture = useKotlinOneWayProject('hostile-config');
  it('keeps every one-way rule on when the project config switches rulesets off, lowers severities or excludes paths, and still runs with plugin rulesets', () => {
    const result = fixture.hostileConfigResult;
    const missing = kotlinRuleCases
      .filter(({ rule }) => rule !== SUPPRESSION_RULE)
      .filter(
        (testCase) =>
          !detektFindingsOf(result.newEnforceable, testCase).some(
            ({ rule }) => rule === testCase.rule,
          ),
      )
      .map(({ id }) => id);

    expect(missing).toEqual([]);
  });
  it('finds runBlocking behind a wildcard import and fully qualified and a forbidden call in a class the project config lists in ignoreAnnotated, and does not ask a mutable holder class to become a data class', () => {
    const extras = fixture.hostileConfigResult.newEnforceable.filter(({ path: file }) =>
      file.includes('/demo/extras/'),
    );

    expect(
      extras
        .filter(({ rule }) => rule === 'detekt.style.ForbiddenMethodCall')
        .map(({ path: file }) => path.basename(file))
        .sort(),
    ).toEqual(['Annotated.kt', 'Printer.kt', 'Qualified.kt', 'Sleeper.kt', 'Wildcard.kt']);
    expect(extras.some(({ rule }) => rule === 'detekt.style.UseDataClass')).toBe(false);
  });
  it('adds the forbidden calls a project lists to the preset ones, and keeps the preset reason of a call both list', () => {
    const forbidden = fixture.hostileConfigResult.newEnforceable.filter(
      ({ rule, path: file }) =>
        rule === 'detekt.style.ForbiddenMethodCall' &&
        (file.includes('/demo/extras/') || file.includes('/demo/scopeRun/')),
    );

    const exception =
      ' To allow it on specific paths, add an "exceptions" entry for rule detekt.style.ForbiddenMethodCall in nitpicker.config.json.';
    const runBlocking =
      'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work. In a test, use `runTest`.';

    const run =
      'The method `kotlin.run` has been forbidden: Use `let` to name a value for a block (`value?.let { ... }` for null), or call the code directly.';

    expect(
      forbidden.map(({ path: file, message }) => [path.basename(file), message]).sort(),
    ).toEqual([
      ['Annotated.kt', `${run}${exception}`],
      ['Banned.kt', `${run}${exception}`],
      [
        'Printer.kt',
        `The method \`kotlin.io.println\` has been forbidden in the detekt config.${exception}`,
      ],
      ['Qualified.kt', `${runBlocking}${exception}`],
      [
        'Sleeper.kt',
        `The method \`java.lang.Thread.sleep\` has been forbidden: Use a scheduler or a test clock instead of sleeping.${exception}`,
      ],
      ['Wildcard.kt', `${runBlocking}${exception}`],
    ]);
  });
  it('does not analyze a Kotlin script among the sources', () => {
    const result = fixture.hostileConfigResult;

    expect(result.newFindings.some(({ path: file }) => file.endsWith('.kts'))).toBe(false);
    expect(result.newFindings.some(({ rule }) => rule === 'gradle-failure')).toBe(false);
  });
  it('reports the suppressions that hide a detekt or ktlint rule, however they are written, and leaves compiler warnings alone', () => {
    const result = fixture.hostileConfigResult;

    const suppressions = result.newEnforceable
      .filter(({ rule, path: file }) => rule === SUPPRESSION_RULE && file.includes('/extras/'))
      .map(({ path: file, identity }) => `${path.basename(file)} ${identity}`);

    expect(suppressions.toSorted()).toEqual([
      'Hidden.kt suppress:UnsafeCallOnNullableType',
      'Hidden.kt suppress:ktlint:standard:indent',
    ]);
  });
});
