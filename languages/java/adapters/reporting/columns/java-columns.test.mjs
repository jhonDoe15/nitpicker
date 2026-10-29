import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { fakeGradleRun } from '../../test-support/in-process-gradle.mjs';

const MAIN = 'src/main/java/demo/A.java';
const SOURCE = 'package demo;\n\n\timport java.util.*;\n/* é😀 */\timport java.io.*;\n';
const STAR_IMPORT = 'com.puppycrawl.tools.checkstyle.checks.imports.AvoidStarImportCheck';

describe('Checkstyle columns of a Gradle run', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function projectWithTabs() {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-columns-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(path.join(root, MAIN), SOURCE);
    const error = (line, column) =>
      `<error line="${String(line)}" column="${String(column)}" severity="warning" message="star import" source="${STAR_IMPORT}"/>`;
    writeFileSync(
      path.join(root, 'checkstyle-report.xml'),
      `<checkstyle version="10.21.1"><file name="${path.join(root, MAIN)}">${error(3, 9)}${error(4, 17)}</file></checkstyle>`,
    );
    return root;
  }

  it('turns the tab-expanded columns into UTF-16 code units of the source line', () => {
    const lines = SOURCE.split('\n');
    const columns = collectJavaFindings(projectWithTabs(), {
      ...fakeGradleRun,
      policy: { preset: 'java' },
    })
      .filter(({ rule }) => rule === 'AvoidStarImport')
      .map(({ location }) => `${String(location.line)}:${String(location.column)}`);

    expect(columns).toEqual([
      `3:${String(lines[2].indexOf('import') + 1)}`,
      `4:${String(lines[3].indexOf('import') + 1)}`,
    ]);
    expect(columns).toEqual(['3:2', '4:11']);
  });
});
