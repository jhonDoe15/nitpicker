import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '../../fixtures/spring-boot-aot');
const AOT_TESTS = "\ntasks.named('test') { systemProperty 'spring.aot.enabled', 'true' }\n";
const TASK_LINE = '> Task :';
const temporary = [];

function projectOf(extra) {
  const parent = mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-aot-'));
  temporary.push(parent);
  const root = path.join(parent, 'shop');
  cpSync(fixture, root, { recursive: true });
  appendFileSync(path.join(root, 'build.gradle'), extra);
  return root;
}

function runGradle(projectRoot, tasks) {
  const result = spawnSync(gradle, ['--console=plain', '-I', INIT_SCRIPT, ...tasks], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 240_000,
  });
  if (result.status !== 0) {
    throw new Error(`Gradle failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout
    .split('\n')
    .filter((line) => line.startsWith(TASK_LINE))
    .map((line) => line.slice(TASK_LINE.length).trim());
}

function testCounts(projectRoot) {
  const report = readFileSync(
    path.join(projectRoot, 'build', 'test-results', 'test', 'TEST-shop.GreeterTest.xml'),
    'utf8',
  );
  const suite = /<testsuite [^>]*>/u.exec(report)?.[0] ?? '';
  return Object.fromEntries(
    ['tests', 'skipped', 'failures', 'errors'].map((name) => [
      name,
      new RegExp(`\\b${name}="(\\d+)"`, 'u').exec(suite)?.[1],
    ]),
  );
}

const aotTasks = (tasks) => tasks.filter((task) => /aot/iu.test(task));
const PASSED = { tests: '1', skipped: '0', failures: '0', errors: '0' };

afterAll(() => {
  for (const parent of temporary.splice(0)) {
    rmSync(parent, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)(
  'Java preset on a Spring Boot build with the GraalVM native plugin',
  () => {
    const runs = {};
    beforeAll(() => {
      runs.plain = projectOf('');
      runs.plainTasks = runGradle(runs.plain, ['nitpickerJava']);
    }, 300_000);
    beforeAll(() => {
      runs.aot = projectOf(AOT_TESTS);
      runs.aotTasks = runGradle(runs.aot, ['test']);
    }, 300_000);

    it('skips Spring AOT processing and leaves the generated source sets out of every tool', () => {
      expect(aotTasks(runs.plainTasks)).toEqual([
        'processTestAot SKIPPED',
        'compileAotTestJava NO-SOURCE',
        'processAotTestResources NO-SOURCE',
        'aotTestClasses UP-TO-DATE',
      ]);
      expect(existsSync(path.join(runs.plain, 'build', 'generated', 'aotTestSources'))).toBe(false);
      const reports = path.join(runs.plain, 'build', 'nitpicker');
      expect(existsSync(path.join(reports, 'errorprone', 'aotTest.args'))).toBe(false);
      const manifest = JSON.parse(readFileSync(path.join(reports, 'manifest.json'), 'utf8'));
      expect(manifest.testSourceRoots).toEqual(['src/test/java']);
      expect(manifest.unrunTestSourceSets).toEqual([]);
    });

    it('still runs the Spring tests on the JVM', () => {
      expect(testCounts(runs.plain)).toEqual(PASSED);
    });

    it('keeps Spring AOT processing for tests that run in AOT mode', () => {
      expect(aotTasks(runs.aotTasks)).toEqual([
        'processTestAot',
        'compileAotTestJava',
        'processAotTestResources',
        'aotTestClasses',
      ]);
      expect(existsSync(path.join(runs.aot, 'build', 'generated', 'aotTestSources'))).toBe(true);
      expect(testCounts(runs.aot)).toEqual(PASSED);
    });
  },
);
