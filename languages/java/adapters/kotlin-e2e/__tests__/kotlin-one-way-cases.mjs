import path from 'node:path';
import { expect, it } from 'vitest';
import {
  expectedMessage,
  fixturePath,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import { SUPPRESSION_RULE, addOneWayHint } from '../../kotlin/rules/kotlin-rules.mjs';
import {
  detektFindingsOf,
  fromTool,
  git,
  kotlinPolicy,
  summarize,
} from '../test-support/kotlin-e2e-project.mjs';

const FORBIDDEN_EXCEPTION =
  ' To allow it on specific paths, add an "exceptions" entry for rule detekt.style.ForbiddenMethodCall in nitpicker.config.json.';
const RUN_BLOCKING =
  'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work. In a test, use `runTest`.';
const RUN =
  'The method `kotlin.run` has been forbidden: Use `let` to name a value for a block (`value?.let { ... }` for null), or call the code directly.';

export function defineBannedCases(fixture, runWithPolicy) {
  it.each(kotlinRuleCases.map((testCase) => [testCase.id, testCase]))(
    'fails the banned form %s with a message that names the allowed form',
    (_id, testCase) => {
      const result = fixture.bannedResult;
      const found = detektFindingsOf(result.newEnforceable, testCase).filter(
        ({ rule }) => rule === testCase.rule,
      );

      expect(found.length, summarize(result.newEnforceable).join('\n')).toBeGreaterThan(0);
      for (const finding of found) {
        expect(finding.message.toLowerCase()).toContain(testCase.allowedForm.toLowerCase());
      }
    },
  );
  it('reports the detekt message each case records and the hint that the gate adds', () => {
    const result = fixture.bannedResult;

    for (const testCase of kotlinRuleCases.filter(({ rule }) => rule !== SUPPRESSION_RULE)) {
      const [finding] = detektFindingsOf(result.newEnforceable, testCase).filter(
        ({ rule }) => rule === testCase.rule,
      );
      const recorded = addOneWayHint({
        tool: 'detekt',
        rule: testCase.rule,
        message: expectedMessage(testCase, 'banned'),
      });

      expect(finding.message).toBe(recorded.message);
    }
  });
  it('does not report the suppressed finding twice: the suppression is the finding', () => {
    const result = fixture.bannedResult;
    const suppression = kotlinRuleCases.find(({ rule }) => rule === SUPPRESSION_RULE);

    expect(detektFindingsOf(result.newEnforceable, suppression).map(({ rule }) => rule)).toEqual([
      SUPPRESSION_RULE,
    ]);
  });
  it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
    git(fixture.project, 'checkout', '-q', 'one-way-banned');
    const exception = (testCase) => ({
      rule: testCase.rule,
      glob: fixturePath(testCase, 'banned'),
    });
    const [scopeRun, scopeWith] = ['scopeRun', 'scopeWith'].map((id) =>
      kotlinRuleCases.find((testCase) => testCase.id === id),
    );
    const result = runWithPolicy(fixture.project, {
      ...kotlinPolicy,
      exceptions: [exception(scopeRun)],
    });

    expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
    expect(detektFindingsOf(result.newEnforceable, scopeWith)).toHaveLength(1);
  });
}

export function defineAllowedCases(fixture) {
  it('lets the allowed form of every case through detekt', () => {
    const result = fixture.allowedResult;

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([]);
  });
}

export function defineHostileConfigCases(fixture, failureRule) {
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

    expect(
      forbidden.map(({ path: file, message }) => [path.basename(file), message]).sort(),
    ).toEqual([
      ['Annotated.kt', `${RUN}${FORBIDDEN_EXCEPTION}`],
      ['Banned.kt', `${RUN}${FORBIDDEN_EXCEPTION}`],
      [
        'Printer.kt',
        `The method \`kotlin.io.println\` has been forbidden in the detekt config.${FORBIDDEN_EXCEPTION}`,
      ],
      ['Qualified.kt', `${RUN_BLOCKING}${FORBIDDEN_EXCEPTION}`],
      [
        'Sleeper.kt',
        `The method \`java.lang.Thread.sleep\` has been forbidden: Use a scheduler or a test clock instead of sleeping.${FORBIDDEN_EXCEPTION}`,
      ],
      ['Wildcard.kt', `${RUN_BLOCKING}${FORBIDDEN_EXCEPTION}`],
    ]);
  });
  it('does not analyze a Kotlin script among the sources', () => {
    const result = fixture.hostileConfigResult;

    expect(result.newFindings.some(({ path: file }) => file.endsWith('.kts'))).toBe(false);
    expect(result.newFindings.some(({ rule }) => rule === failureRule)).toBe(false);
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
}
