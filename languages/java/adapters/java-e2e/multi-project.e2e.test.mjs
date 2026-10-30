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
import { childrenAt, childrenNamed, parseXml } from '../../../../shared/ingest/common.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { analyzeWithIncludedBuild, GRADLE_STEP_TIMEOUT_MS } from '../test-support/gradle-e2e.mjs';

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
  }, 300_000);

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

  it('reports an annotation whose name contains Generated on hand-written code', () => {
    expect(located(findings, 'pmd', 'GeneratedOnHandWrittenCode')).toEqual([
      'app/src/main/java/demo/app/Stamped.java',
      'app/src/main/java/demo/app/Stamped.java',
      'lib/src/main/java/demo/lib/Counter.java',
    ]);
  });

  it('reports @DoNotMutate, which PIT skips', () => {
    expect(located(findings, 'pmd', 'MutationIgnoreMarker')).toEqual([
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

  it('reports the tests of the integrationTest source set, which no test task runs', () => {
    expect(located(findings, 'test-runtime', 'test-not-run')).toEqual([
      'app/src/integrationTest/java/demo/app/GreeterFlowTest.java',
    ]);
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

describe.skipIf(!enabled)(
  'a Gradle build whose plugins come from an included build-logic build and buildSrc',
  () => {
    it('leaves both plugin builds unconfigured and analyzes the root build', () => {
      const result = analyzeWithIncludedBuild(
        path.join(import.meta.dirname, '..', 'fixtures', 'build-logic-java'),
        { gradle, policy: { preset: 'java' } },
      );

      expect([result.status, result.mutations], result.output).toEqual([0, []]);
      expect(located(result.findings, 'pmd', 'UnusedPrivateField')).toEqual([
        'src/main/java/demo/Counter.java',
      ]);
      expect(result.nested).toEqual([]);
    }, 180_000);
  },
);

describe.skipIf(!enabled)('Java coverage with architecture tests', () => {
  it('keeps merged execution data valid and counts only application tests toward coverage', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-jacoco-'));
    try {
      cpSync(path.resolve(import.meta.dirname, '../fixtures/gradle-project'), root, {
        recursive: true,
      });
      writeFileSync(
        path.join(root, 'build.gradle'),
        `${readFileSync(path.join(root, 'build.gradle'), 'utf8')}
apply plugin: 'jacoco'
jacoco { toolVersion = '0.8.12' }
tasks.named('jacocoTestReport') {
    executionData.setFrom(fileTree(layout.buildDirectory) { include 'jacoco/*.exec' })
    reports { xml.required = true }
}
`,
      );
      writeFileSync(
        path.join(root, 'src/test/java/demo/CoverageArchTest.java'),
        `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

class CoverageArchTest {
  @Test
  void exercisesCodeOutsideApplicationTests() {
    assertEquals("ADA", new Greeter().shout("Ada"));
  }
}
`,
      );
      const run = (args) => {
        const result = spawnSync(gradle, ['--console=plain', ...args], {
          cwd: root,
          encoding: 'utf8',
          timeout: GRADLE_STEP_TIMEOUT_MS,
        });
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      };
      run(['test', 'jacocoTestReport']);
      writeFileSync(
        path.join(root, 'verify-coverage.init.gradle'),
        `gradle.taskGraph.whenReady {
    def task = gradle.rootProject.tasks.named('nitpickerArchunit').get()
    assert !task.extensions.getByType(org.gradle.testing.jacoco.plugins.JacocoTaskExtension).enabled
    assert !task.outputs.files.files.any { it.name == 'nitpickerArchunit.exec' }
}
`,
      );
      run([
        'clean',
        '-I',
        path.resolve(import.meta.dirname, '../../gradle/nitpicker.init.gradle'),
        '-I',
        path.join(root, 'verify-coverage.init.gradle'),
        'test',
        'nitpickerArchunit',
        'nitpickerJacoco',
      ]);
      expect(existsSync(path.join(root, 'build/jacoco/nitpickerArchunit.exec'))).toBe(false);
      const architecture = parseXml(
        readFileSync(
          path.join(root, 'build/nitpicker/archunit/TEST-demo.CoverageArchTest.xml'),
          'utf8',
        ),
      );
      const { tests, skipped, failures, errors } = architecture.attrs;
      expect({ tests, skipped, failures, errors }).toEqual({
        tests: '1',
        skipped: '0',
        failures: '0',
        errors: '0',
      });
      const coverage = parseXml(
        readFileSync(path.join(root, 'build/nitpicker/jacoco.xml'), 'utf8'),
      );
      expect(
        childrenAt(coverage, 'package', 'class', 'method').map((method) => [
          method.attrs.name,
          childrenNamed(method, 'counter').find(({ attrs }) => attrs.type === 'METHOD').attrs,
        ]),
      ).toEqual([
        ['<init>', { type: 'METHOD', missed: '0', covered: '1' }],
        ['greet', { type: 'METHOD', missed: '0', covered: '1' }],
        ['shout', { type: 'METHOD', missed: '1', covered: '0' }],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});

describe.skipIf(!enabled)('formatting a module without Java sources', () => {
  it('writes empty reports, clears stale findings and keeps real Gradle failures readable', () => {
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
  }, 180_000);
});
