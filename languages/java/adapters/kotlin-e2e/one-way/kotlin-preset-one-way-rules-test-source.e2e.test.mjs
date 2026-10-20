import { describe, expect, it } from 'vitest';
import {
  expectedMessage,
  kotlinRuleCases,
} from '../../kotlin/rules/test-support/kotlin-rule-cases.mjs';
import { addOneWayHint } from '../../kotlin/rules/kotlin-rules.mjs';
import { detektFindingsOf, kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin swallowed exceptions in test sources', () => {
  const fixture = useKotlinOneWayProject('test-source');
  it('reports a swallowing catch in a test source with the same message and the test form', () => {
    const swallowed = kotlinRuleCases.find(({ id }) => id === 'swallowedException');
    const found = detektFindingsOf(testSourceResult.newEnforceable, swallowed);

    expect(found.map(({ rule, path: file, message }) => [rule, file, message])).toEqual([
      [
        swallowed.rule,
        'src/test/kotlin/demo/swallowedException/SwallowedTest.kt',
        addOneWayHint({
          tool: 'detekt',
          rule: swallowed.rule,
          message: expectedMessage(swallowed, 'banned'),
        }).message,
      ],
    ]);
    expect(found[0].message).toContain('In a test, use `assertFailsWith`.');
  });
});
