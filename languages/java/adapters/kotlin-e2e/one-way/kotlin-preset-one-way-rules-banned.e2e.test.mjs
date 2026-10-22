import { describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import {
  expectedMessage,
  fixturePath,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import { SUPPRESSION_RULE, addOneWayHint } from '../../kotlin/rules/kotlin-rules.mjs';
import {
  detektFindingsOf,
  git,
  gradle,
  kotlinPolicy,
  kotlinE2eEnabled,
  summarize,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  const fixture = useKotlinOneWayProject('banned');
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
    const result = runJavaDiff({
      repositoryRoot: fixture.project.root,
      requestedBaseRef: 'main',
      gradle,
      policy: { ...kotlinPolicy, exceptions: [exception(scopeRun)] },
    });

    expect(detektFindingsOf(result.newEnforceable, scopeRun)).toEqual([]);
    expect(detektFindingsOf(result.newEnforceable, scopeWith)).toHaveLength(1);
  });
});
