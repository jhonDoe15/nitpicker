import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  it('compiles the main and test sources instead of running the tests under the JaCoCo agent', () => {
    const args = buildArguments(true);

    expect(args.filter((argument) => ['test-compile', 'test'].includes(argument))).toEqual([
      'test-compile',
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
    expect(buildGoals({ quick: true, pinned, modules: [] })).toEqual(['test-compile']);
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

  it('reads no test results', () => {
    expect(readTestRuns({ quick: true })).toBe(false);
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
