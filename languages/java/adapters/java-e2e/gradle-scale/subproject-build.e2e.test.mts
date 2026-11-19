import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
import type { JavaFinding } from '../../typed/java-values.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const GRADLE_9 = '9.5.1';
const fixture = path.join(import.meta.dirname, '../../fixtures/multi-project');
const ISOLATED_PROJECTS =
  'org.gradle.configuration-cache=true\norg.gradle.unsafe.isolated-projects=true\n';
const RECORD_VERSION = "\nfile('gradle-version.txt').text = gradle.gradleVersion\n";
const temporary: string[] = [];

function buildWithWrapper(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-subproject-build-'));
  temporary.push(root);
  cpSync(fixture, root, { recursive: true });
  const result = spawnSync(
    gradle,
    ['--quiet', '--no-configuration-cache', 'wrapper', '--gradle-version', GRADLE_9],
    { cwd: root, encoding: 'utf8', timeout: 120_000 },
  );
  if (result.status !== 0) {
    throw new Error(`gradle wrapper failed:\n${result.stdout}${result.stderr}`);
  }
  writeFileSync(path.join(root, 'gradle.properties'), ISOLATED_PROJECTS);
  writeFileSync(path.join(root, 'lib/build.gradle'), RECORD_VERSION);
  return root;
}

afterAll(() => {
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)(
  'Java preset on one subproject of a Gradle 9 build that turns on Isolated Projects',
  () => {
    let root: string;
    let findings: readonly JavaFinding[];
    beforeAll(() => {
      root = buildWithWrapper();
      findings = collectJavaFindings(path.join(root, 'lib'), { policy: { quick: true } });
    }, 300_000);

    it('runs the wrapper at the root of the build, not the gradle on the PATH', () => {
      expect(readFileSync(path.join(root, 'lib/gradle-version.txt'), 'utf8')).toBe(GRADLE_9);
    });

    it('turns Isolated Projects off for its own run and reports the subproject', () => {
      expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
      expect(
        findings.filter(({ tool, rule }) => tool === 'pmd' && rule === 'UnusedPrivateField'),
      ).toMatchObject([{ path: 'src/main/java/demo/lib/Counter.java' }]);
    });
  },
);
