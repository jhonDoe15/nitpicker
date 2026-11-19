import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  markedProbeLines,
  reportedProbeLines,
  usePmdProbe,
} from '../../test-support/pmd/pmd-probe.mts';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { appendSentence, exceptionRoute } from '../../test-support/views/java-e2e-views.mts';
import {
  REUSABLE_OBJECT_MESSAGE as REUSABLE_OBJECT_MESSAGE_UNTYPED,
  REUSABLE_OBJECT_RULE as REUSABLE_OBJECT_RULE_UNTYPED,
} from '../../../../messages/reuse/reusable-objects.mts';

const REUSABLE_OBJECT_MESSAGE: string = REUSABLE_OBJECT_MESSAGE_UNTYPED;
const REUSABLE_OBJECT_RULE: string = REUSABLE_OBJECT_RULE_UNTYPED;

function byText(left: string, right: string): number {
  return left.localeCompare(right);
}

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const PACKAGE = 'java/shop/reuse';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/reusable-objects');
const MARKER = new RegExp(`// violation: (?:\\w+, )*${REUSABLE_OBJECT_RULE}(?:, \\w+)*$`, 'u');
const RULES = new Set([REUSABLE_OBJECT_RULE]);

function markedLines(role: string): string[] {
  return markedProbeLines(
    fixtures,
    MARKER,
    (location) => `src/${role}/${PACKAGE}/${location}`,
  ).sort(byText);
}

function reportedLines(findings: readonly JavaFinding[], role: string): string[] {
  return reportedProbeLines(findings, role, RULES).sort(byText);
}

describe.skipIf(!enabled)(
  'Shareable objects built on every call, in a project without Spring',
  () => {
    const probe = usePmdProbe('reusable-objects', gradle, { fixtures, target: PACKAGE });

    it('reports the marked constructions from the main rule set, with no classpath', () => {
      const reported = reportedLines(probe.findings, 'main');

      expect(reported).toEqual(markedLines('main'));
      expect(reported).toHaveLength(13);
    });

    it('leaves test sources alone', () => {
      expect(reportedLines(probe.findings, 'test')).toEqual([]);
    });

    it('names the allowed forms and the exception route', () => {
      const first = probe.findings.find(({ rule }) => rule === REUSABLE_OBJECT_RULE);

      expect(first?.message).toBe(
        appendSentence(
          REUSABLE_OBJECT_MESSAGE,
          exceptionRoute({ rule: `pmd/${REUSABLE_OBJECT_RULE}`, path: first?.path }),
        ),
      );
    });
  },
);
