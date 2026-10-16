import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ERROR_PRONE_SKIPPED,
  FORMAT_SKIPPED,
  STRUCTURE_SKIPPED,
  skippedToolFindings,
  withoutCheckstyleParseSkips,
} from './skipped-tools.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportRootWith(files) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-skipped-tools-'));
  roots.push(reportRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(reportRoot, name), text);
  }
  return reportRoot;
}

describe('skippedToolFindings', () => {
  it('names each tool that could not run, the side and module, and the reason', () => {
    const reportRoot = reportRootWith({
      [ERROR_PRONE_SKIPPED]: 'Error Prone needs at least JDK 21. Install one\n',
      [FORMAT_SKIPPED]: 'google-java-format needs at least JDK 21. Install one\n',
    });

    expect(
      skippedToolFindings({ reportRoot, testScope: { snapshot: 'base', moduleLabel: 'lib' } }),
    ).toStrictEqual(
      [
        ['errorprone', 'Error Prone'],
        ['google-java-format', 'google-java-format'],
      ].map(([tool, name]) => ({
        tool,
        rule: 'tool-skipped',
        path: '.',
        identity: 'tool-skipped',
        classification: 'tool-error',
        message:
          `${name} did not run in module lib of the base snapshot: ${name} needs at least ` +
          'JDK 21. Install one.',
      })),
    );
  });

  it('names CRAP too when the structure metrics it needs could not run', () => {
    const reportRoot = reportRootWith({ [STRUCTURE_SKIPPED]: 'it needs JDK 21\n' });

    expect(
      skippedToolFindings({ reportRoot }).map(({ tool, message }) => [tool, message]),
    ).toStrictEqual([
      ['structure', 'The structure metrics did not run in the head snapshot: it needs JDK 21.'],
      ['crap', 'CRAP did not run in the head snapshot: it needs JDK 21.'],
    ]);
  });

  it('names each Kotlin tool that could not run on its own', () => {
    const reportRoot = reportRootWith({
      'detekt-skipped.txt': 'detekt runs on JDK 17 to 21 only\n',
      'ktlint-skipped.txt': 'ktlint needs JDK 17\n',
      'ktfmt-skipped.txt': 'ktfmt needs JDK 17\n',
      'kotlin-metrics-skipped.txt': 'KotlinMetrics needs JDK 17\n',
    });

    expect(
      skippedToolFindings({ reportRoot }).map(({ tool, message }) => [tool, message]),
    ).toStrictEqual([
      ['detekt', 'detekt did not run in the head snapshot: detekt runs on JDK 17 to 21 only.'],
      ['ktlint', 'ktlint did not run in the head snapshot: ktlint needs JDK 17.'],
      ['ktfmt', 'ktfmt did not run in the head snapshot: ktfmt needs JDK 17.'],
      [
        'structure',
        'The Kotlin structure metrics did not run in the head snapshot: KotlinMetrics needs JDK 17.',
      ],
      ['crap', 'Kotlin CRAP did not run in the head snapshot: KotlinMetrics needs JDK 17.'],
    ]);
  });

  it('reports nothing when every tool ran', () => {
    expect(skippedToolFindings({ reportRoot: reportRootWith({}) })).toStrictEqual([]);
  });

  it('turns the files Checkstyle could not parse into one tool error and keeps its other findings', () => {
    const finding = (rule, file) => ({ tool: 'checkstyle', rule, path: file, message: rule });
    const kept = finding('EmptyBlock', 'src/main/java/demo/A.java');
    const parseSkip = (file) => finding('com.puppycrawl.tools.checkstyle.TreeWalker', file);

    expect(
      withoutCheckstyleParseSkips([
        parseSkip('src/main/java/demo/C.java'),
        kept,
        parseSkip('src/main/java/demo/B.java'),
      ]),
    ).toStrictEqual([
      kept,
      {
        tool: 'checkstyle',
        rule: 'tool-skipped',
        path: '.',
        identity: 'tool-skipped',
        classification: 'tool-error',
        message:
          'Checkstyle did not run in the head snapshot: it cannot parse src/main/java/demo/B.java, ' +
          'src/main/java/demo/C.java, whose Java syntax is newer than the pinned Checkstyle knows ' +
          '(a module import, or statements before super()). The other analyzers still ran.',
      },
    ]);
  });
});
