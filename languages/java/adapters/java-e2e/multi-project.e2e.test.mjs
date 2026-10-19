import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'multi-project');

function located(findings, tool, rule) {
  return findings
    .filter((finding) => finding.tool === tool && finding.rule === rule)
    .map((finding) => finding.path)
    .sort();
}

describe.skipIf(!enabled)('a Gradle build of two projects and an extra source set', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-multi-project-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, {
      gradle,
      policy: { preset: 'java', testSeconds: { unitTestSeconds: 0.0001 } },
    });
  }, GRADLE_STEP_TIMEOUT_MS);

  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads each project with its folder in the path, including one without tests', () => {
    expect(located(findings, 'pmd', 'UnusedPrivateField')).toEqual([
      'lib/src/main/java/demo/lib/Counter.java',
    ]);
    expect(located(findings, 'jacoco', 'uncovered-method')).toEqual([
      'lib/src/main/java/demo/lib/Counter.java',
      'lib/src/main/java/demo/lib/Counter.java',
    ]);
  });

  it('reports @Generated on hand-written code, but not an annotation that only starts with it', () => {
    expect(located(findings, 'pmd', 'GeneratedOnHandWrittenCode')).toEqual([
      'app/src/main/java/demo/app/Stamped.java',
    ]);
  });

  it('accepts fluent setters, string literals in conditions and placeholders of plain values', () => {
    expect(
      ['AvoidFieldNameMatchingMethodName', 'AvoidLiteralsInIfCondition', 'GuardLogStatement'].map(
        (rule) => located(findings, 'pmd', rule),
      ),
    ).toEqual([[], [], ['app/src/main/java/demo/app/Settings.java']]);
  });

  it('counts the dependency of app on lib once, across the two projects', () => {
    expect(
      findings
        .filter(
          (finding) => finding.rule === 'package-coupling' && finding.identity.endsWith(':fanIn'),
        )
        .map((finding) => `${finding.identity} ${String(finding.metric.value)}`)
        .toSorted(),
    ).toEqual(['package:app/demo.app:fanIn 0', 'package:lib/demo.lib:fanIn 1']);
  });

  it('lints and compiles the integrationTest source set with the test rules, and not the jmh one', () => {
    const integrationTest = ['app/src/integrationTest/java/demo/app/GreeterRun.java'];

    expect(located(findings, 'errorprone', 'SystemOut')).toEqual(integrationTest);
    expect(located(findings, 'pmd', 'FixedSleepInTest')).toEqual(integrationTest);
    expect(located(findings, 'errorprone', 'PreferJavaTimeOverload')).toEqual(integrationTest);
    expect(findings.filter((finding) => finding.path?.includes('/src/jmh/'))).toEqual([]);
    expect(existsSync(path.join(root, 'app/build/classes/java/jmh'))).toBe(false);
  });

  it('times every test of the test task from its JUnit XML, under the module path', () => {
    expect(
      findings
        .filter((finding) => finding.rule === 'slow-test')
        .map((finding) => [finding.path, finding.identity, finding.location]),
    ).toEqual([
      [
        'app/src/test/java/demo/app/GreeterTest.java',
        'test:demo.app.GreeterTest#greetsByName()',
        { line: 9 },
      ],
    ]);
  });
});

describe.skipIf(!enabled)('formatting a module without Java sources', () => {
  it(
    'writes empty reports, clears stale findings and keeps real Gradle failures readable',
    () => {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-empty-format-'));
      const initScript = path.resolve(import.meta.dirname, '../../gradle/nitpicker.init.gradle');
      const report = path.join(root, 'models/build/nitpicker/format.txt');
      const source = path.join(root, 'models/src/main/java/Example.java');
      const run = (...tasks) =>
        spawnSync(
          gradle,
          ['--no-daemon', '--console=plain', '--continue', '-I', initScript, ...tasks],
          { cwd: root, encoding: 'utf8', timeout: GRADLE_STEP_TIMEOUT_MS },
        );

      try {
        mkdirSync(path.join(root, 'models/src/main/resources'), { recursive: true });
        writeFileSync(path.join(root, 'settings.gradle'), "include 'models'\n");
        writeFileSync(path.join(root, 'models/build.gradle'), "plugins { id 'java' }\n");
        writeFileSync(path.join(root, 'models/src/main/resources/schema.json'), '{}');
        writeFileSync(
          path.join(root, 'build.gradle'),
          `tasks.register('unrelatedFailure') {
        doLast { throw new GradleException('unrelated failure remains visible') }
      }`,
        );

        const empty = run(':models:nitpickerFormat');
        expect(empty.status, empty.stderr).toBe(0);
        expect(empty.stdout.split('\n').filter((line) => line.startsWith('> Task '))).toEqual([
          '> Task :models:nitpickerFormat SKIPPED',
        ]);
        expect(empty.stderr).not.toMatch(/no files were provided|Usage: google-java-format/);
        expect(readFileSync(report, 'utf8')).toBe('');

        mkdirSync(path.dirname(source), { recursive: true });
        writeFileSync(source, 'class Example{int value(){return 1;}}\n');
        const withJava = run(':models:nitpickerFormat');
        expect(withJava.status, withJava.stderr).toBe(0);
        expect(readFileSync(report, 'utf8')).toBe(`${source}\n`);

        rmSync(source);
        const failed = run(':models:nitpickerFormat', 'unrelatedFailure');
        expect(failed.status).not.toBe(0);
        expect(failed.stderr.split('* What went wrong:\n')[1]?.split('\n\n')[0]).toBe(
          "Execution failed for task ':unrelatedFailure'.\n> unrelated failure remains visible",
        );
        expect(failed.stderr).not.toMatch(/no files were provided|Usage: google-java-format/);
        expect(readFileSync(report, 'utf8')).toBe('');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
