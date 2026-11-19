import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  markedProbeLines,
  reportedProbeLines,
  usePmdProbe,
} from '../../test-support/pmd/pmd-probe.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const PACKAGE = 'java/shop/close';
const fixtures = path.resolve(import.meta.dirname, '../../fixtures/close-resource');
const MARKER = /\/\/ violation: (?:CloseResource|UnclosedInlineResource)$/u;
const RULES = new Set(['CloseResource', 'UnclosedInlineResource']);

describe.skipIf(!enabled)('Closeables held in a local variable', () => {
  const probe = usePmdProbe('close-resource', gradle, { fixtures, target: PACKAGE });

  it('reports only the handles the method opens and never closes', () => {
    const marked = markedProbeLines(
      fixtures,
      MARKER,
      (location) => `src/main/${PACKAGE}/${location}`,
    ).sort();

    expect(reportedProbeLines(probe.findings, 'main', RULES).sort()).toEqual(marked);
    expect(marked).toHaveLength(8);
  });
});
