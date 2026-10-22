import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from '../test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

const TEST_SOURCE = 'package demo\n\nclass ArchitectureTest\n';

function suite(...testCases) {
  return `<testsuite name="demo.ArchitectureTest">${testCases.join('')}</testsuite>`;
}

function failing(name, ...lines) {
  return `<testcase name="${name}" classname="demo.ArchitectureTest"><failure message="${lines.join('&#10;')}"/></testcase>`;
}

function projectWithArchunit(report) {
  const root = projectWithKotlinReports({
    manifest: { testSourceRoots: [], kotlinTestSourceRoots: ['src/test/kotlin'] },
  });
  mkdirSync(path.join(root, 'src/test/kotlin/demo'), { recursive: true });
  writeFileSync(path.join(root, 'src/test/kotlin/demo/ArchitectureTest.kt'), TEST_SOURCE);
  mkdirSync(path.join(rootReports(root), 'archunit'));
  writeFileSync(path.join(rootReports(root), 'archunit/TEST-demo.ArchitectureTest.xml'), report);
  return root;
}

function summary(findings) {
  return findings.map(({ rule, path: file, symbol, identity }) => [rule, file, symbol, identity]);
}

describe('readJavaFindings with the kotlin preset: ArchUnit', () => {
  it('attaches a violation to the Kotlin source file named in the report, also for a file facade', () => {
    const report = suite(
      failing(
        'no_dates',
        'Architecture Violation - Rule &apos;no dates&apos; was violated (2 times):',
        'Method &lt;demo.Bad.compute()&gt; calls constructor &lt;java.util.Date.&lt;init&gt;()&gt; in (Bad.kt:9)',
        'Method &lt;demo.BadKt.helper()&gt; calls constructor &lt;java.util.Date.&lt;init&gt;()&gt; in (Bad.kt:12)',
      ),
    );

    expect(summary(kotlinFindings(projectWithArchunit(report), 'archunit'))).toEqual([
      ['no_dates', 'src/main/kotlin/demo/Bad.kt', 'demo.Bad', 'demo.Bad'],
      ['no_dates', 'src/main/kotlin/demo/Bad.kt', 'demo.BadKt', 'demo.BadKt'],
    ]);
  });

  it('finds the Kotlin file of a class when the report names no file, and the Kotlin test class of a rule that fails without violations', () => {
    const report = suite(
      failing(
        'no_dates',
        'Architecture Violation - Rule &apos;no dates&apos; was violated (1 times):',
        'Class &lt;demo.Bad&gt; depends on class &lt;java.util.Date&gt;',
      ),
      failing('layers', 'rule failed'),
    );

    expect(summary(kotlinFindings(projectWithArchunit(report), 'archunit'))).toEqual([
      ['no_dates', 'src/main/kotlin/demo/Bad.kt', 'demo.Bad', 'demo.Bad'],
      [
        'layers',
        'src/test/kotlin/demo/ArchitectureTest.kt',
        undefined,
        'demo.ArchitectureTest:test-failure',
      ],
    ]);
  });
});
