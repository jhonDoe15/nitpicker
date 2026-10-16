import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../java-diff.mjs';
import {
  EXTRA_SOURCES,
  HOSTILE_DETEKT_CONFIG,
  ruleFixtures,
} from './test-support/kotlin-one-way-data.mjs';
import {
  expectedMessage,
  fixturePath,
  kotlinRuleCases,
} from '../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import { SUPPRESSION_RULE, addOneWayHint } from '../kotlin/rules/kotlin-rules.mjs';
import {
  commitBranch,
  detektFindingsOf,
  diffOf,
  fromTool,
  git,
  gradle,
  initializeProject,
  kotlinPolicy,
  kotlinPolicyWithProjectDetekt,
  kotlinE2eEnabled,
  removeProject,
  summarize,
} from './test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  let project;
  let bannedResult;
  let allowedResult;
  let hostileConfigResult;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'one-way-banned', ruleFixtures('banned'));
    commitBranch(project, 'one-way-allowed', ruleFixtures('allowed'));
    commitBranch(project, 'one-way-hostile-config', {
      ...ruleFixtures('banned'),
      'config/detekt/detekt.yml': HOSTILE_DETEKT_CONFIG,
      ...Object.fromEntries(
        Object.entries(EXTRA_SOURCES).map(([name, text]) => [
          `src/main/kotlin/demo/extras/${name}`,
          text,
        ]),
      ),
    });
    bannedResult = diffOf(project, 'one-way-banned');
    allowedResult = diffOf(project, 'one-way-allowed');
    hostileConfigResult = diffOf(project, 'one-way-hostile-config', {
      policy: kotlinPolicyWithProjectDetekt,
    });
  });
  afterAll(() => {
    removeProject(project);
  });
  it.each(kotlinRuleCases.map((testCase) => [testCase.id, testCase]))(
    'fails the banned form %s with a message that names the allowed form',
    (_id, testCase) => {
      const result = bannedResult;
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
    const result = bannedResult;

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
  it('lets the allowed form of every case through detekt', () => {
    const result = allowedResult;

    expect(fromTool(result.newEnforceable, 'detekt')).toEqual([]);
  });
  it('does not report the suppressed finding twice: the suppression is the finding', () => {
    const result = bannedResult;
    const suppression = kotlinRuleCases.find(({ rule }) => rule === SUPPRESSION_RULE);

    expect(detektFindingsOf(result.newEnforceable, suppression).map(({ rule }) => rule)).toEqual([
      SUPPRESSION_RULE,
    ]);
  });
  it('keeps every one-way rule on when the project config switches rulesets off, lowers severities or excludes paths, and still runs with plugin rulesets', () => {
    const result = hostileConfigResult;
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
  it('finds runBlocking behind a wildcard import and fully qualified, and does not ask a mutable holder class to become a data class', () => {
    const extras = hostileConfigResult.newEnforceable.filter(({ path: file }) =>
      file.includes('/demo/extras/'),
    );

    expect(
      extras
        .filter(({ rule }) => rule === 'detekt.style.ForbiddenMethodCall')
        .map(({ path: file }) => path.basename(file))
        .sort(),
    ).toEqual(['Qualified.kt', 'Wildcard.kt']);
    expect(extras.some(({ rule }) => rule === 'detekt.style.UseDataClass')).toBe(false);
  });
  it('does not analyze a Kotlin script among the sources', () => {
    const result = hostileConfigResult;

    expect(result.newFindings.some(({ path: file }) => file.endsWith('.kts'))).toBe(false);
    expect(result.newFindings.some(({ rule }) => rule === 'gradle-failure')).toBe(false);
  });
  it('reports the suppressions that hide a detekt or ktlint rule, however they are written, and leaves compiler warnings alone', () => {
    const result = hostileConfigResult;

    const suppressions = result.newEnforceable
      .filter(({ rule, path: file }) => rule === SUPPRESSION_RULE && file.includes('/extras/'))
      .map(({ path: file, identity }) => `${path.basename(file)} ${identity}`);

    expect(suppressions.toSorted()).toEqual([
      'Hidden.kt suppress:UnsafeCallOnNullableType',
      'Hidden.kt suppress:ktlint:standard:indent',
    ]);
  });
  it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
    git(project, 'checkout', '-q', 'one-way-banned');
    const exception = (testCase) => ({
      rule: testCase.rule,
      glob: fixturePath(testCase, 'banned'),
    });
    const [scopeRun, scopeWith] = ['scopeRun', 'scopeWith'].map((id) =>
      kotlinRuleCases.find((testCase) => testCase.id === id),
    );
    const result = runJavaDiff({
      repositoryRoot: project.root,
      requestedBaseRef: 'main',
      gradle,
      policy: { ...kotlinPolicy, exceptions: [exception(scopeRun)] },
    });

    expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
    expect(detektFindingsOf(result.newEnforceable, scopeWith)).toHaveLength(1);
  });
});
