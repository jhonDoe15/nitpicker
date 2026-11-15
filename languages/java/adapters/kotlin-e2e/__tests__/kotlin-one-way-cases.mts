import path from 'node:path';
import { expect, it } from 'vitest';
import {
  expectedMessage,
  fixturePath,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mts';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { withKotlinRuleMessage as untypedWithKotlinRuleMessage } from '../../kotlin/rules/kotlin-messages.mjs';
import { SUPPRESSION_RULE } from '../../kotlin/rules/kotlin-rules.mjs';
import { assigned } from '../test-support/views/assigned.mts';
import {
  detektFindingsOf,
  fromTool,
  git,
  kotlinPolicy,
  summarize,
  type DiffResult,
  type KotlinPolicy,
  type KotlinProject,
} from './kotlin-e2e-project.mts';
import type { KotlinRuleCase } from '../../kotlin/rules/test-support/kotlin-guard-cases.mts';

type CaseFixture = { readonly project: KotlinProject };
type RecordedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly message: string | undefined;
  readonly classification: string;
};

const withKotlinRuleMessage: (finding: RecordedFinding) => { readonly message: string } =
  untypedWithKotlinRuleMessage;
const exceptionHint: (rule: string, file: string) => string = untypedExceptionHint;

const RUN_BLOCKING =
  'The method `kotlinx.coroutines.runBlocking` has been forbidden: Make the caller `suspend` (`suspend fun main()` for an entry point) and use `coroutineScope { ... }` for concurrent work. In a test, use `runTest`.';
const RUN =
  'The method `kotlin.run` has been forbidden: Use `let` to name a value for a block (`value?.let { ... }` for null), or call the code directly.';

function byText(left: readonly string[], right: readonly string[]): number {
  const leftText = left.join(',');
  const rightText = right.join(',');
  if (leftText === rightText) {
    return 0;
  }
  return leftText < rightText ? -1 : 1;
}

function caseNamed(id: string): KotlinRuleCase {
  return assigned(
    kotlinRuleCases.find((testCase) => testCase.id === id),
    id,
  );
}

function recordedFinding(testCase: KotlinRuleCase, file: string) {
  return withKotlinRuleMessage({
    tool: 'detekt',
    rule: testCase.rule,
    path: file,
    message: expectedMessage(testCase, 'banned'),
    classification: 'enforceable',
  });
}

export function defineBannedCases(
  fixture: CaseFixture & { readonly bannedResult: DiffResult },
  runWithPolicy: (project: KotlinProject, policy: KotlinPolicy) => DiffResult,
): void {
  it.each(kotlinRuleCases.map((testCase) => [testCase.id, testCase]))(
    'fails the banned form %s with a message that names the allowed form',
    (_id, testCase) => {
      const result = fixture.bannedResult;
      const found = detektFindingsOf(result.newEnforceable, testCase).filter(
        ({ rule }) => rule === testCase.rule,
      );
      const file = fixturePath(testCase, 'banned');

      const message =
        testCase.message === undefined ? undefined : recordedFinding(testCase, file).message;

      expect(
        found.map((finding) => [finding.path, message === undefined ? undefined : finding.message]),
        summarize(result.newEnforceable).join('\n'),
      ).toEqual([[file, message]]);
      expect(assigned(found[0], 'found').message.toLowerCase()).toContain(
        testCase.allowedForm.toLowerCase(),
      );
    },
  );
  it('reports the detekt message each case records and the hint that the gate adds', () => {
    const result = fixture.bannedResult;

    const compared = kotlinRuleCases
      .filter(({ rule }) => rule !== SUPPRESSION_RULE)
      .map((testCase) => {
        const finding = assigned(
          detektFindingsOf(result.newEnforceable, testCase).find(
            ({ rule }) => rule === testCase.rule,
          ),
          'finding',
        );
        return {
          actual: finding.message,
          recorded: recordedFinding(testCase, finding.path).message,
        };
      });

    expect(compared.map(({ actual }) => actual)).toEqual(compared.map(({ recorded }) => recorded));
  });
  it('does not report the suppressed finding twice: the suppression is the finding', () => {
    const result = fixture.bannedResult;
    const suppression = assigned(
      kotlinRuleCases.find(({ rule }) => rule === SUPPRESSION_RULE),
      'suppression',
    );

    expect(detektFindingsOf(result.newEnforceable, suppression).map(({ rule }) => rule)).toEqual([
      SUPPRESSION_RULE,
    ]);
  });
  it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
    git(fixture.project, 'checkout', '-q', 'one-way-banned');
    const exception = (testCase: KotlinRuleCase) => ({
      rule: testCase.rule,
      paths: [fixturePath(testCase, 'banned')],
      reason: 'The test lifts this rule for one path.',
    });
    const scopeRun = caseNamed('scopeRun');
    const scopeWith = caseNamed('scopeWith');
    const result = runWithPolicy(fixture.project, {
      ...kotlinPolicy,
      exceptions: [exception(scopeRun)],
    });

    expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
    expect(
      detektFindingsOf(result.newEnforceable, scopeWith).map(({ path: file }) => file),
    ).toEqual([fixturePath(scopeWith, 'banned')]);
  });
}

export function defineAllowedCases(fixture: { readonly allowedResult: DiffResult }): void {
  it('lets the allowed form of every case through detekt', () => {
    const result = fixture.allowedResult;

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([]);
  });
}

export function defineHostileConfigCases(
  fixture: { readonly hostileConfigResult: DiffResult },
  failureRule: string,
): void {
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
    ).toEqual([
      'Annotated.kt',
      'Exiter.kt',
      'Printer.kt',
      'Qualified.kt',
      'Sleeper.kt',
      'Wildcard.kt',
    ]);
    expect(extras.map(({ rule, path: file }) => `${rule} ${path.basename(file)}`).sort()).toEqual([
      'UnsafeCastOperator Compiler.kt',
      'detekt.style.ForbiddenMethodCall Annotated.kt',
      'detekt.style.ForbiddenMethodCall Exiter.kt',
      'detekt.style.ForbiddenMethodCall Printer.kt',
      'detekt.style.ForbiddenMethodCall Qualified.kt',
      'detekt.style.ForbiddenMethodCall Sleeper.kt',
      'detekt.style.ForbiddenMethodCall Wildcard.kt',
      'detekt.style.MayBeConst Hidden.kt',
      'detekt.style.MayBeConst Hidden.kt',
      'detekt.style.WildcardImport Wildcard.kt',
      'inline-suppression Compiler.kt',
      'inline-suppression Hidden.kt',
      'inline-suppression Hidden.kt',
      'ktlint.standard:class-signature Holder.kt',
      'ktlint.standard:class-signature Holder.kt',
      'ktlint.standard:kdoc Hidden.kt',
      'ktlint.standard:no-wildcard-imports Wildcard.kt',
      ...[
        'Annotated',
        'Compiler',
        'Compiler',
        'Exiter',
        'Hidden',
        'Holder',
        'Printer',
        'Qualified',
        'Qualified',
        'Sleeper',
        'Wildcard',
        'Wildcard',
      ].map((name) => `mutant-nocoverage ${name}.kt`),
    ]);
  });
  it('adds the forbidden calls a project lists to the preset ones, and keeps the preset reason of a call both list', () => {
    const forbidden = fixture.hostileConfigResult.newEnforceable.filter(
      ({ rule, path: file }) =>
        rule === 'detekt.style.ForbiddenMethodCall' &&
        (file.includes('/demo/extras/') || file.includes('/demo/scopeRun/')),
    );

    const routed = (file: string, message: string) =>
      `${message} ${exceptionHint('detekt.style.ForbiddenMethodCall', file)}`;
    const expected = {
      'Annotated.kt': RUN,
      'Banned.kt': RUN,
      'Exiter.kt': 'The method `java.lang.System.exit` has been forbidden in the detekt config.',
      'Printer.kt':
        'The method `kotlin.io.println` has been forbidden: Log through the application logger (`logger.info(...)`) instead of printing to the console. For program output, write to an `Appendable`, `PrintStream` or `Writer` parameter that the file with `fun main` passes as `System.out`.',
      'Qualified.kt': RUN_BLOCKING,
      'Sleeper.kt':
        'The method `java.lang.Thread.sleep` has been forbidden: Do not sleep in production code. Schedule the work (`ScheduledExecutorService`) or wait on the condition.',
      'Wildcard.kt': RUN_BLOCKING,
    };
    const fileOf = (name: string) =>
      name === 'Banned.kt'
        ? 'src/main/kotlin/demo/scopeRun/Banned.kt'
        : `src/main/kotlin/demo/extras/${name}`;

    expect(
      forbidden.map(({ path: file, message }) => [path.basename(file), message]).sort(byText),
    ).toEqual(
      Object.entries(expected)
        .map(([name, message]) => [name, routed(fileOf(name), message)])
        .sort(byText),
    );
  });
  it('does not analyze a Kotlin script among the sources', () => {
    const result = fixture.hostileConfigResult;

    expect(
      [...new Set(result.newFindings.map(({ path: file }) => path.extname(file)))].sort(),
    ).toEqual(['', '.java', '.kt']);
    expect(result.newFindings.filter(({ rule }) => rule === failureRule)).toEqual([]);
  });
  it('reports the suppressions that hide a detekt or ktlint rule or a compiler warning, however they are written, and leaves other compiler diagnostics alone', () => {
    const result = fixture.hostileConfigResult;

    const suppressions = result.newEnforceable
      .filter(({ rule, path: file }) => rule === SUPPRESSION_RULE && file.includes('/extras/'))
      .map(({ path: file, identity }) => `${path.basename(file)} ${identity}`);

    expect(suppressions.toSorted()).toEqual([
      'Compiler.kt suppress:UNCHECKED_CAST',
      'Hidden.kt suppress:UnsafeCallOnNullableType',
      'Hidden.kt suppress:ktlint:standard:indent',
    ]);
  });
}
