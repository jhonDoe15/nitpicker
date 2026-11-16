import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { markedProbeLines, usePmdProbe } from '../../test-support/pmd/pmd-probe.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/generic-names');
const RULES = new Set(['GenericTypeName', 'GenericPackageName']);
const MARKER = /\/\/ violation: (\w+)$/u;

function markedLines(): string[] {
  return markedProbeLines(
    fixtures,
    MARKER,
    (location, match) => `src/main/java/demo/${location} ${match[1] ?? ''}`,
  ).sort();
}

describe.skipIf(!enabled)('generic type and package names', () => {
  const probe = usePmdProbe('generic-names', gradle, { fixtures, target: 'java/demo' });

  it('reports each marked line in main sources and none in test sources', () => {
    const reported = probe.findings
      .filter(({ rule }) => RULES.has(rule))
      .map(({ rule, path: file, location }) => `${file}:${String(location?.line)} ${rule}`)
      .sort();

    expect(reported).toEqual(markedLines());
    expect(reported).toHaveLength(9);
  });

  it('names the allowed form and the exception route in every message', () => {
    const messages = probe.findings
      .filter(({ rule }) => RULES.has(rule))
      .map(({ message }) => textOf(message));

    expect(messages.filter((message) => !message.includes('shared package'))).toEqual([]);
    expect(messages.filter((message) => !message.includes('An exception fits'))).toEqual([]);
  });
});
