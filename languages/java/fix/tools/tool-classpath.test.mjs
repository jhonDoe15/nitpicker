import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeJvmTools } from '../test-support/fake-jvm-tools.mjs';
import {
  FIX_TOOLS_INIT_SCRIPT,
  gradleToolArguments,
  parseToolClasspaths,
  resolveToolClasspaths,
} from './tool-classpath.mjs';

const roots = [];
const TOOLS = {
  'java-format': {
    coordinates: 'com.google.googlejavaformat:google-java-format:1.25.2',
    transitive: true,
  },
  ktlint: { coordinates: 'com.pinterest.ktlint:ktlint-cli:1.8.0:all', transitive: false },
};
const ENVIRONMENT = { NITPICKER_MAVEN: 'fake-mvn' };
const MAVEN_DEPENDENCY_GOAL =
  'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath';

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-fix-tools-')));
  roots.push(root);
  for (const file of files) {
    writeFileSync(path.join(root, file), '');
  }
  vi.stubEnv('XDG_CACHE_HOME', path.join(root, 'cache'));
  return root;
}

describe('gradleToolArguments', () => {
  it('runs the resolving task with the init script and one property naming every tool', () => {
    expect(gradleToolArguments(TOOLS)).toEqual([
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      '-I',
      FIX_TOOLS_INIT_SCRIPT,
      '-Pnitpicker.fix.tools=java-format=com.google.googlejavaformat:google-java-format:1.25.2,ktlint=com.pinterest.ktlint:ktlint-cli:1.8.0:all!',
      'nitpickerFixTools',
    ]);
  });
});

describe('parseToolClasspaths', () => {
  it('reads one tab separated line per tool and ignores other output', () => {
    const delimiter = path.delimiter;
    const output = [
      'Welcome to Gradle',
      `nitpicker-fix-tool\tjava-format\t/a.jar${delimiter}/b c.jar`,
      'nitpicker-fix-tool\tktlint\t/k.jar',
      '',
    ].join('\r\n');

    expect(parseToolClasspaths(output)).toEqual({
      'java-format': ['/a.jar', '/b c.jar'],
      ktlint: ['/k.jar'],
    });
  });
});

describe('resolveToolClasspaths', () => {
  it('resolves through Gradle for a Gradle project', () => {
    const root = project(['build.gradle']);
    const tools = fakeJvmTools();

    const classpaths = resolveToolClasspaths({
      projectRoot: root,
      tools: TOOLS,
      executeFixCommand: tools.executeFixCommand,
    });

    expect(classpaths).toEqual({
      'java-format': ['/fake/java-format.jar'],
      ktlint: ['/fake/ktlint.jar'],
    });
    expect(tools.calls).toEqual([
      {
        operation: 'fix-tools',
        command: 'gradle',
        args: gradleToolArguments(TOOLS),
        cwd: root,
        acceptedStatuses: [0],
        environment: {},
        input: undefined,
      },
    ]);
  });
  it('runs the command the environment names instead of the wrapper or the PATH', () => {
    const root = project(['build.gradle']);
    const tools = fakeJvmTools();

    resolveToolClasspaths({
      projectRoot: root,
      tools: TOOLS,
      environment: { NITPICKER_GRADLE: 'custom-gradle' },
      executeFixCommand: tools.executeFixCommand,
    });

    expect(tools.calls.map(({ command }) => command)).toEqual(['custom-gradle']);
  });
  it('resolves through Maven for a Maven project, with no transitive jars for a fat jar', () => {
    const root = project(['pom.xml']);
    const tools = fakeJvmTools();

    const classpaths = resolveToolClasspaths({
      projectRoot: root,
      tools: TOOLS,
      environment: ENVIRONMENT,
      executeFixCommand: tools.executeFixCommand,
    });

    expect(Object.keys(classpaths)).toEqual(['java-format', 'ktlint']);
    expect(tools.calls.map(({ operation, command }) => [operation, command])).toEqual([
      ['fix-tools', 'fake-mvn'],
    ]);
    expect(tools.calls[0].args.includes(MAVEN_DEPENDENCY_GOAL)).toBe(true);
  });
  it('fails when the build does not resolve a tool', () => {
    const root = project(['build.gradle']);

    expect(() =>
      resolveToolClasspaths({
        projectRoot: root,
        tools: TOOLS,
        executeFixCommand: () => ({ status: 0, stdout: 'nitpicker-fix-tool\tktlint\t/k.jar\n' }),
      }),
    ).toThrow('The build resolved no jars for java-format');
  });
  it('fails with the Gradle error when Gradle fails', () => {
    const root = project(['build.gradle']);

    expect(() =>
      resolveToolClasspaths({
        projectRoot: root,
        tools: TOOLS,
        executeFixCommand: () => ({ status: 1, stderr: 'Could not resolve com.google' }),
      }),
    ).toThrow('fix-tools failed: Could not resolve com.google');
  });
});
