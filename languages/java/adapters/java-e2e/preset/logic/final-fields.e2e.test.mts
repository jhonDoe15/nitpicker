import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  markedRuleLines as markedLinesIn,
  reportedRuleLines,
  usePmdProbe,
} from '../../test-support/pmd/pmd-probe.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/final-fields');
const RULES = new Set(['FieldCanBeFinal']);
describe.skipIf(!enabled)('private fields that are only assigned while the object is built', () => {
  const probe = usePmdProbe('final-fields', gradle, { fixtures, target: 'java/demo' });

  it.each(['main', 'test'])(
    'reports each marked field in %s sources, and none that a later write, a framework or a lambda needs',
    (role) => {
      expect(reportedRuleLines(probe.findings, role, RULES)).toEqual(markedLinesIn(fixtures, role));
      expect(markedLinesIn(fixtures, role)).toHaveLength(11);
    },
  );

  it('names the field and the fix in the message', () => {
    const messages = probe.findings
      .filter(({ rule }) => rule === 'FieldCanBeFinal')
      .map(({ message = '' }) => message.replace(/^Field \S+ | If this is intended.*$/gu, ''));

    expect(messages).toEqual(
      messages.map(() => 'is only assigned during initialization; declare it final.'),
    );
  });
});
