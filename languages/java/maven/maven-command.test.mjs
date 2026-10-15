import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectJavaBuild } from './maven-build.mjs';
import { mavenErrorSummary, mavenTarget, runMaven } from './maven-command.mjs';

const roots = [];

function project(files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-')));
  roots.push(root);
  for (const [name, { text = '', mode = 0o644 }] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
    chmodSync(path.join(root, name), mode);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detectJavaBuild', () => {
  it.each([
    [[], 'gradle'],
    [['build.gradle'], 'gradle'],
    [['pom.xml'], 'maven'],
    [['pom.xml', 'mvnw'], 'maven'],
    [['pom.xml', 'settings.gradle.kts'], 'gradle'],
    [['pom.xml', 'build.gradle', 'mvnw'], 'maven'],
    [['pom.xml', 'build.gradle', 'mvnw', 'gradlew'], 'gradle'],
  ])('with %j picks %s', (files, expected) => {
    const root = project(Object.fromEntries(files.map((name) => [name, {}])));

    expect(detectJavaBuild(root)).toBe(expected);
  });
});

describe.skipIf(process.platform === 'win32')('mavenTarget', () => {
  const args = ['--quiet', 'test'];

  it('runs the configured command, then the wrapper, then mvn from the PATH', () => {
    const withWrapper = project({ mvnw: { text: '#!/bin/sh\n', mode: 0o755 } });

    expect(mavenTarget({ projectRoot: withWrapper, configured: '/opt/mvn', args })).toEqual({
      command: '/opt/mvn',
      args,
      shell: false,
    });
    expect(mavenTarget({ projectRoot: withWrapper, configured: undefined, args })).toEqual({
      command: path.join(withWrapper, 'mvnw'),
      args,
      shell: false,
    });
    expect(mavenTarget({ projectRoot: project(), configured: undefined, args })).toEqual({
      command: 'mvn',
      args,
      shell: false,
    });
  });

  it('uses mvnw.cmd on Windows', () => {
    const root = project({ 'mvnw.cmd': {} });

    expect(mavenTarget({ projectRoot: root, args, platform: 'win32' })).toEqual({
      command: `"${path.join(root, 'mvnw.cmd')}"`,
      args: args.map((arg) => `"${arg}"`),
      shell: true,
    });
  });

  it('reports the Maven errors without the help boilerplate', () => {
    const maven = project({
      mvn: {
        text: [
          '#!/bin/sh',
          'echo "Picked up JAVA_TOOL_OPTIONS: -Dx=y" >&2',
          'echo "[INFO] Scanning for projects..."',
          'echo "[ERROR] COMPILATION ERROR :"',
          'echo "[ERROR] /src/A.java:[3,1] class, interface, enum, or record expected"',
          'echo "[ERROR] "',
          'echo "[ERROR] -> [Help 1]"',
          'echo "[ERROR] Re-run Maven using the -X switch to enable full debug logging."',
          'exit 1',
        ].join('\n'),
        mode: 0o755,
      },
    });
    const root = project();

    expect(() =>
      runMaven({ projectRoot: root, maven: path.join(maven, 'mvn'), args: ['test'] }),
    ).toThrow(
      `Maven failed in ${root}:\n[ERROR] COMPILATION ERROR :\n[ERROR] /src/A.java:[3,1] class, interface, enum, or record expected`,
    );
  });
});

describe('mavenErrorSummary', () => {
  it('falls back to the whole output without JVM notices when Maven printed no error line', () => {
    expect(
      mavenErrorSummary(
        'Picked up JAVA_TOOL_OPTIONS: -Dx\nError: JAVA_HOME is not defined correctly.\n',
      ),
    ).toBe('Error: JAVA_HOME is not defined correctly.');
    expect(mavenErrorSummary('')).toBe('no diagnostic output');
  });
});
