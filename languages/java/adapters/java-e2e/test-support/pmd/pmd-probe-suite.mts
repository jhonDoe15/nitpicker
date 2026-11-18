import { describe, expect, it } from 'vitest';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { markedRoleLines, reportedRoleLines, routedMessages, usePmdProbe } from './pmd-probe.mts';

export type ProbeSuite = {
  readonly title: string;
  readonly probeName: string;
  readonly target: string;
  readonly fixtures: string;
  readonly rule: string;
  readonly marker: RegExp;
  readonly enabled: boolean;
  readonly gradle: string;
  readonly ruleset: string;
  readonly expectedCount: number;
  readonly mainTitle: string;
  readonly testTitle: string;
  readonly prefixOf: (role: string) => string;
};

export function describePmdRuleProbe(suite: ProbeSuite): void {
  const rules = new Set([suite.rule]);
  function marked(role: string): string[] {
    return markedRoleLines(suite.fixtures, suite.marker, suite.prefixOf, role);
  }
  function reported(findings: readonly JavaFinding[], role: string): string[] {
    return reportedRoleLines(findings, role, rules);
  }

  describe.skipIf(!suite.enabled)(suite.title, () => {
    const probe = usePmdProbe(suite.probeName, suite.gradle, {
      fixtures: suite.fixtures,
      target: suite.target,
    });

    it(suite.mainTitle, () => {
      expect(reported(probe.findings, 'main')).toEqual(marked('main'));
      expect(reported(probe.findings, 'main')).toHaveLength(suite.expectedCount);
    });

    it(suite.testTitle, () => {
      expect(reported(probe.findings, 'test')).toEqual([]);
    });

    it('names the allowed forms and the exception route', () => {
      const { actual, expected } = routedMessages(probe.findings, suite.ruleset, suite.rule);

      expect(actual).toBe(expected);
    });
  });
}
