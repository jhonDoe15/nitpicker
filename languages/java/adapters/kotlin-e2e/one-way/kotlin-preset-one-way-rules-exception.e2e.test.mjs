import { describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import {
  fixturePath,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import {
  detektFindingsOf,
  git,
  gradle,
  kotlinPolicy,
  kotlinE2eEnabled,
} from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rule exceptions end to end', () => {
  const fixture = useKotlinOneWayProject('exception');
  it('lifts a rule for the paths of an exception in nitpicker.config.json only', () => {
    git(fixture.project, 'checkout', '-q', 'one-way-banned');
    const exception = (testCase) => ({
      rule: testCase.rule,
      paths: [fixturePath(testCase, 'banned')],
      reason: 'The test lifts this rule for one path.',
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
