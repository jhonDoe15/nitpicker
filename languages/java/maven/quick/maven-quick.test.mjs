import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../builds/java-build.mjs';
import { runMavenPreset } from '../maven-build.mjs';
import { toolDependencies } from '../maven-tools.mjs';
import { withoutTestTools } from './maven-quick.mjs';
import { analyzeTests, buildGoals, readTestRuns } from './maven-test-phase.mjs';

const roots = [];
const pinned = readPinnedTools();

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function effectivePom(root) {
  return `<?xml version="1.0"?>
<project>
  <groupId>demo</groupId>
  <artifactId>shop</artifactId>
  <build>
    <sourceDirectory>${root}/src/main/java</sourceDirectory>
    <testSourceDirectory>${root}/src/test/java</testSourceDirectory>
  </build>
</project>
`;
}

function projectWithFakeMaven() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-quick-')));
  roots.push(root);
  writeFileSync(
    path.join(root, 'pom.xml'),
    '<project><groupId>demo</groupId><artifactId>shop</artifactId></project>',
  );
  const buildCalls = [];
  function spawn(_command, args) {
    const output = args.find((argument) => argument.startsWith('-Doutput='));
    if (output !== undefined) {
      writeFileSync(output.slice('-Doutput='.length), effectivePom(root));
      return { status: 0, stdout: '', stderr: '' };
    }
    buildCalls.push(args);
    return { status: 1, stdout: '', stderr: '[ERROR] stop after the build goals' };
  }
  return { root, spawn, buildCalls };
}

function buildArguments(quick) {
  const { root, spawn, buildCalls } = projectWithFakeMaven();

  expect(() => runMavenPreset(root, { maven: 'mvn', spawn, policy: { quick } })).toThrow(
    'stop after the build goals',
  );
  return buildCalls[0];
}

describe('the Maven build in a quick run', () => {
  it('runs only the ArchUnit test classes, without the JaCoCo agent', () => {
    const args = buildArguments(true);

    expect(args.filter((argument) => ['test-compile', 'test'].includes(argument))).toEqual([
      'test',
    ]);
    expect(args.filter((argument) => argument.startsWith('-Dtest='))).toEqual([
      '-Dtest=**/*ArchTest,**/*ArchitectureTest',
    ]);
    expect(args.some((argument) => argument.includes('jacoco'))).toBe(false);
    expect(args.some((argument) => argument.includes('dependency-plugin'))).toBe(true);
  });

  it('runs the tests under the JaCoCo agent in a full run', () => {
    const args = buildArguments(false);

    expect(args.filter((argument) => ['test-compile', 'test'].includes(argument))).toEqual([
      'test',
    ]);
    expect(args.some((argument) => argument.includes('jacoco-maven-plugin'))).toBe(true);
  });

  it('plans the goals from the run mode', () => {
    expect(
      buildGoals({
        quick: true,
        pinned,
        modules: [{ archunitIncludes: '**/*Rules.class, **/*ArchTest.class' }, {}],
      }),
    ).toEqual([
      'test',
      '-Dtest=**/*Rules,**/*ArchTest,**/*ArchitectureTest',
      '-Dsurefire.failIfNoSpecifiedTests=false',
      '-DfailIfNoSpecifiedTests=false',
      '-DfailIfNoTests=false',
    ]);
    expect(buildGoals({ quick: false, pinned, modules: [{ runsFailsafe: false }] })).toEqual([
      `org.jacoco:jacoco-maven-plugin:${pinned.jacoco}:prepare-agent`,
      '-Djacoco.destFile=${project.build.directory}/nitpicker-jacoco.exec',
      'test',
    ]);
  });

  it('resolves no coverage, mutation or JUnit launcher tools', () => {
    const all = toolDependencies(pinned, ['1.11.4'], []);

    expect(Object.keys(withoutTestTools(all))).toEqual([
      'pmd',
      'spotbugs',
      'checkstyle',
      'errorprone',
    ]);
    expect(Object.keys(all)).toEqual([
      'pmd',
      'spotbugs',
      'checkstyle',
      'errorprone',
      'jacoco',
      'pit',
      'pit-junit5',
      'pit-testng',
      'launcher-1.11.4',
    ]);
  });

  it('copies only the ArchUnit reports and reports that no other test ran', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-quick-results-')));
    roots.push(root);
    const surefireReports = path.join(root, 'target/surefire-reports');
    const reportDir = path.join(root, 'target/nitpicker');
    mkdirSync(surefireReports, { recursive: true });
    mkdirSync(path.join(root, 'target/test-classes'), { recursive: true });
    for (const suite of ['demo.ArchitectureTest', 'demo.StaleTest']) {
      writeFileSync(
        path.join(surefireReports, `TEST-${suite}.xml`),
        `<testsuite name="${suite}" tests="1" failures="0"><testcase name="t"/></testsuite>`,
      );
    }
    const module = {
      basedir: root,
      surefireReports,
      failsafeReports: surefireReports,
      testOutputDirectory: path.join(root, 'target/test-classes'),
    };

    const testsRan = readTestRuns({
      quick: true,
      module,
      reportDir,
      since: 0,
      isArchunit: (suite) => suite.endsWith('ArchitectureTest'),
    });

    expect(testsRan).toBe(false);
    expect(readdirSync(path.join(reportDir, 'archunit'))).toEqual([
      'TEST-demo.ArchitectureTest.xml',
    ]);
  });

  it('runs neither the coverage report nor the mutation run', () => {
    const spawn = () => {
      throw new Error('no tool may run');
    };

    expect(() => {
      analyzeTests({ quick: true, spring: false, spawn, module: {}, classpaths: {} });
    }).not.toThrow();
  });
});
