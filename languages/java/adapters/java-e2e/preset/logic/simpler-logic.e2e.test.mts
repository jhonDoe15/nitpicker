import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  markedProbeLines,
  probeFindingsIn,
  usePmdProbe,
} from '../../test-support/pmd/pmd-probe.mts';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/simpler-logic');
const SIMPLER_FORMS = {
  SimplifyBooleanReturns: ['is return c;', 'return c || x;', '!c && x'],
  SimplifyBooleanExpressions: ['x == true and x != false are x', 'x == false and x != true are !x'],
  SimplifiedTernary: ['c ? true : x is c || x', 'c ? x : false is c && x'],
  SimplifyConditional: ['x instanceof Foo is already false when x is null'],
  CollapsibleIfStatements: ['if (a) { if (b) { ... } } is if (a && b) { ... }'],
  LogicInversion: ['!(a == b) is a != b', '!(a < b) is a >= b'],
  ConfusingTernary: ['if (!c) A else B is if (c) B else A', '!c ? a : b is c ? b : a'],
  NegatedOperands: ['!a && !b is !(a || b)', '!a || !b is !(a && b)'],
};
const RULES = new Set(Object.keys(SIMPLER_FORMS));
const MARKER = /\/\/ violation: (\w+)$/u;

function markedLines(role: string): string[] {
  return markedProbeLines(
    fixtures,
    MARKER,
    (location, match) => `src/${role}/java/demo/${location} ${match[1] ?? ''}`,
  ).sort();
}

function reportedLines(findings: readonly JavaFinding[], role: string): string[] {
  return probeFindingsIn(findings, role, RULES)
    .map(({ rule, path: file, location }) => `${file}:${String(location?.line)} ${rule}`)
    .sort();
}

describe.skipIf(!enabled)('boolean logic with an exact simpler form', () => {
  const probe = usePmdProbe('simpler-logic', gradle, { fixtures, target: 'java/demo' });

  it.each(['main', 'test'])(
    'reports each marked line in %s sources, and none of the simpler forms',
    (role) => {
      expect(reportedLines(probe.findings, role)).toEqual(markedLines(role));
      expect(reportedLines(probe.findings, role)).toHaveLength(18);
    },
  );

  it.each(Object.entries(SIMPLER_FORMS))(
    'prints the simpler form in every %s message',
    (rule, forms) => {
      const messages = probe.findings
        .filter((finding) => finding.rule === rule)
        .map(({ message }) => textOf(message));

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.filter((message) => !forms.every((form) => message.includes(form)))).toEqual(
        [],
      );
    },
  );
});
