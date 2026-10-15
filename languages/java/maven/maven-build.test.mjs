import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_TEST,
  architectureArguments,
  architectureExcludes,
  coveragePatterns,
  describeArguments,
  testArguments,
  withCoverageAgent,
} from './maven-build.mjs';

const roots = [];

function classesWith(...classFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-classes-'));
  roots.push(root);
  for (const file of classFiles) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const DEPENDENCY_PLUGIN = 'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath';
const TEST_RUN = [
  '-DskipTests=false',
  '-Dmaven.test.skip=false',
  '-Djacoco.skip=true',
  '-DfailIfNoTests=false',
  '-Dsurefire.failIfNoSpecifiedTests=false',
];

describe('Maven invocations', () => {
  it('compiles first and then describes the reactor and writes the compile classpath', () => {
    expect(describeArguments('/tmp/effective.xml')).toEqual([
      'test-compile',
      'org.apache.maven.plugins:maven-help-plugin:3.5.1:effective-pom',
      '-Doutput=/tmp/effective.xml',
      DEPENDENCY_PLUGIN,
      '-Dmdep.outputFile=target/nitpicker/classpath-compile.txt',
      '-DincludeScope=compile',
    ]);
  });

  it('runs the tests with the project config but without skips, its own JaCoCo or ArchUnit rules', () => {
    expect(testArguments('/tmp/excludes.txt')).toEqual([
      'test',
      DEPENDENCY_PLUGIN,
      '-Dmdep.outputFile=target/nitpicker/classpath-test.txt',
      '-DincludeScope=test',
      ...TEST_RUN,
      '-Dsurefire.excludesFile=/tmp/excludes.txt',
    ]);
  });

  it('runs only the ArchUnit classes in the second pass and keeps going when they fail', () => {
    expect(architectureArguments()).toEqual([
      'test',
      '-Dtest=*ArchTest,*ArchitectureTest',
      ...TEST_RUN,
      '-Dmaven.test.failure.ignore=true',
    ]);
    expect(architectureExcludes()).toBe('**/*ArchTest.java\n**/*ArchitectureTest.java');
  });

  it('recognises ArchUnit rule classes by name', () => {
    expect(ARCHITECTURE_TEST.test('LayerArchTest.class')).toBe(true);
    expect(ARCHITECTURE_TEST.test('LayerArchitectureTest.class')).toBe(true);
    expect(ARCHITECTURE_TEST.test('LayerTest.class')).toBe(false);
    expect(ARCHITECTURE_TEST.test('LayerArchTest$Inner.class')).toBe(false);
  });
});

describe('coverage agent', () => {
  it('limits the agent to the top packages of the project classes', () => {
    const root = classesWith(
      'com/example/shop/A.class',
      'com/example/shop/orders/B.class',
      'com/example/billing/C.class',
    );

    expect(coveragePatterns([root])).toEqual(['com.example.billing.*', 'com.example.shop.*']);
  });

  it('instruments everything when a class is in the default package', () => {
    expect(coveragePatterns([classesWith('Main.class', 'a/B.class')])).toEqual(['*']);
  });

  it('has no patterns without classes', () => {
    expect(coveragePatterns([])).toEqual([]);
  });

  it('adds the agent to the existing JAVA_TOOL_OPTIONS instead of replacing them', () => {
    const env = withCoverageAgent(
      { JAVA_TOOL_OPTIONS: '-Dhttps.proxyHost=proxy', PATH: '/bin' },
      { agentJar: '/repo/agent.jar', patterns: ['a.*', 'b.*'] },
    );

    expect(env.PATH).toBe('/bin');
    expect(env.JAVA_TOOL_OPTIONS).toBe(
      '-Dhttps.proxyHost=proxy -javaagent:/repo/agent.jar=destfile=target/nitpicker/jacoco.exec,includes=a.*:b.*',
    );
  });

  it('quotes the agent option when the jar path has a space', () => {
    const env = withCoverageAgent({}, { agentJar: '/my repo/agent.jar', patterns: ['a.*'] });

    expect(env.JAVA_TOOL_OPTIONS).toBe(
      '"-javaagent:/my repo/agent.jar=destfile=target/nitpicker/jacoco.exec,includes=a.*"',
    );
  });

  it('leaves the environment alone when there is nothing to measure', () => {
    const env = { PATH: '/bin' };

    expect(withCoverageAgent(env, { agentJar: '/a.jar', patterns: [] })).toBe(env);
  });
});
