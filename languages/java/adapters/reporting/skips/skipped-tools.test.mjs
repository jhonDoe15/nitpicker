import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKSTYLE_SKIPPED,
  ERROR_PRONE_SKIPPED,
  FORMAT_SKIPPED,
  STRUCTURE_SKIPPED,
  skippedFiles,
  skippedToolFindings,
} from './skipped-tools.mjs';

describe('the tools a build skipped for want of a JDK', () => {
  let reportRoot;
  beforeEach(() => {
    reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-skips-'));
  });
  afterEach(() => {
    rmSync(reportRoot, { recursive: true, force: true });
  });
  const skip = (file, reason) => {
    writeFileSync(path.join(reportRoot, file), `${reason}\n`);
  };

  it('report nothing when every tool ran', () => {
    expect(skippedToolFindings({ reportRoot, javaStyle: 'google' })).toEqual([]);
    expect(skippedFiles(reportRoot)).toEqual(new Set());
  });

  it('is one tool error for each skipped tool, naming the module and the reason', () => {
    skip(ERROR_PRONE_SKIPPED, 'Error Prone needs JDK 21 or newer. Install one');
    skip(FORMAT_SKIPPED, 'no JDK 21');
    skip(CHECKSTYLE_SKIPPED, 'no JDK 21 for Checkstyle');

    const findings = skippedToolFindings({ reportRoot, javaStyle: 'google', moduleDir: 'core' });

    expect(
      findings.map(({ tool, rule, classification, message }) => [
        tool,
        rule,
        classification,
        message,
      ]),
    ).toEqual([
      [
        'errorprone',
        'tool-skipped',
        'tool-error',
        'Error Prone did not run in module core: Error Prone needs JDK 21 or newer. Install one.',
      ],
      [
        'google-java-format',
        'tool-skipped',
        'tool-error',
        'google-java-format did not run in module core: no JDK 21.',
      ],
      [
        'checkstyle',
        'tool-skipped',
        'tool-error',
        'Checkstyle did not run in module core: no JDK 21 for Checkstyle.',
      ],
    ]);
    expect(skippedFiles(reportRoot)).toEqual(
      new Set([ERROR_PRONE_SKIPPED, FORMAT_SKIPPED, CHECKSTYLE_SKIPPED]),
    );
  });

  it('skips the structure metrics and CRAP together, which needs them', () => {
    skip(STRUCTURE_SKIPPED, 'needs JDK 25');

    expect(
      skippedToolFindings({ reportRoot, javaStyle: 'google' }).map(({ tool }) => tool),
    ).toEqual(['structure', 'crap']);
  });
});
