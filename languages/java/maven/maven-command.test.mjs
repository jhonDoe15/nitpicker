import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
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

describe.skipIf(process.platform === 'win32')('Maven failures', () => {
  it('names the ways to provide Maven when it is not installed', () => {
    const root = project();

    expect(() =>
      runMaven({ projectRoot: root, maven: path.join(root, 'no-such-mvn'), args: ['test'] }),
    ).toThrow(
      new Error(
        `${path.join(root, 'no-such-mvn')} was not found. Add the Maven wrapper (mvnw) to the project, put mvn on the PATH, or set NITPICKER_MAVEN`,
      ),
    );
  });

  it('reports a failed Maven build of the analyzed project as java/maven-failure', () => {
    const root = project({ 'pom.xml': {} });
    const maven = project({
      mvn: { text: '#!/bin/sh\necho "[ERROR] broken pom"\nexit 1\n', mode: 0o755 },
    });

    expect(analyzeJavaSnapshot(root, { maven: path.join(maven, 'mvn') }).findings).toEqual([
      {
        tool: 'java',
        rule: 'maven-failure',
        path: '.',
        identity: 'maven-failure',
        message: `Maven failed in ${root}:\n[ERROR] broken pom`,
        classification: 'tool-error',
      },
    ]);
  });

  it('asks for a Gradle build under the kotlin preset', () => {
    const root = project({ 'pom.xml': {} });

    expect(
      analyzeJavaSnapshot(root, { maven: '/unused', policy: { preset: 'kotlin' } }).findings,
    ).toEqual([
      {
        tool: 'kotlin',
        rule: 'maven-failure',
        path: '.',
        identity: 'maven-failure',
        message:
          'The kotlin preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources',
        classification: 'tool-error',
      },
    ]);
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

  it('names the minimum Maven version when Maven is too old for nitpicker', () => {
    expect(mavenErrorSummary('Unrecognized option: --no-transfer-progress\n')).toBe(
      'Unrecognized option: --no-transfer-progress\nnitpicker needs Maven 3.6.3 or newer',
    );
  });
});
