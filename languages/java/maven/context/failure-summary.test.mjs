import { describe, expect, it } from 'vitest';
import { testFailureSummary } from './failure-summary.mjs';

const OUTPUT = `[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.5 s <<< FAILURE! -- in a.BTest
[ERROR] a.BTest.works -- Time elapsed: 0.01 s <<< FAILURE!
org.opentest4j.AssertionFailedError: expected
SEVERE: noise from the tests
[ERROR] Failures: 
[ERROR]   BTest.works:12 expected: <a
> but was: <b
>
[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.2.5:test
`;

describe('testFailureSummary', () => {
  it('keeps the failing tests and the totals and drops the test output around them', () => {
    expect(testFailureSummary(OUTPUT)).toBe(
      [
        '[ERROR] Failures:',
        '[ERROR]   BTest.works:12 expected: <a',
        '> but was: <b',
        '>',
        '[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0',
      ].join('\n'),
    );
  });

  it('caps a long list and shortens long lines', () => {
    const many = Array.from(
      { length: 60 },
      (_, index) => `[ERROR]   T.t${String(index)}:1 ${'x'.repeat(300)}`,
    );
    const summary = testFailureSummary(
      `[ERROR] Failures: \n${many.join('\n')}\n[ERROR] Tests run: 60, Failures: 60, Errors: 0, Skipped: 0\n`,
    ).split('\n');

    expect(summary).toHaveLength(41);
    expect(summary.at(-1)).toBe('...');
    expect(summary[1].endsWith('...')).toBe(true);
    expect(summary[1].length).toBeLessThan(240);
  });

  it('has nothing to say about a build failure that is not a test failure', () => {
    expect(testFailureSummary('[ERROR] COMPILATION ERROR : A.java:[3,1] boom')).toBeUndefined();
  });
});
