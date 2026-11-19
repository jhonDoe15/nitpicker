import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gradleTarget, isolatedProjectsOff, pinnedGradleVersion } from './gradle-command.mjs';
import { mavenTarget } from '../../maven/maven-command.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import { analyzeJavaSnapshot } from '../java-runner.mts';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

type ProjectFiles = Readonly<Record<string, { readonly text?: string; readonly mode?: number }>>;

const roots: string[] = [];
let previousGradle: string | undefined;
let previousUserHome: string | undefined;

function project(files: ProjectFiles = {}): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-')));
  roots.push(root);
  for (const [name, { text = '', mode = 0o644 }] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
    chmodSync(path.join(root, name), mode);
  }
  return root;
}

const EXECUTABLE = { text: '#!/bin/sh\nexit 0\n', mode: 0o755 };

function wrapper(text = EXECUTABLE.text): ProjectFiles {
  return { gradlew: { text, mode: 0o755 } };
}

beforeEach(() => {
  previousGradle = process.env['NITPICKER_GRADLE'];
  previousUserHome = process.env['GRADLE_USER_HOME'];
  delete process.env['NITPICKER_GRADLE'];
  process.env['GRADLE_USER_HOME'] = project();
});

afterEach(() => {
  for (const [name, value] of [
    ['NITPICKER_GRADLE', previousGradle],
    ['GRADLE_USER_HOME', previousUserHome],
  ] as const) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('gradleTarget', () => {
  const args = ['--quiet', '-I', 'init.gradle'];
  function plain(command: string, commandArgs = args): object {
    return { command, args: commandArgs, shell: false };
  }

  it('prefers the command that was configured', () => {
    expect(
      gradleTarget({ projectRoot: project(wrapper()), configured: './my-gradle', args }),
    ).toEqual(plain('./my-gradle'));
  });

  it('uses the executable wrapper of the project, as an absolute path', () => {
    const root = project(wrapper());

    expect(gradleTarget({ projectRoot: root, configured: undefined, args })).toEqual(
      plain(path.join(root, 'gradlew')),
    );
    expect(gradleTarget({ projectRoot: root, configured: '', args })).toEqual(
      plain(path.join(root, 'gradlew')),
    );
  });

  it('runs a wrapper without the executable bit through sh', () => {
    const root = project({ gradlew: { text: '#!/bin/sh\nexit 0\n', mode: 0o644 } });

    expect(gradleTarget({ projectRoot: root, configured: undefined, args })).toEqual(
      plain('sh', [path.join(root, 'gradlew'), ...args]),
    );
  });

  it('falls back to gradle on the PATH without a wrapper', () => {
    expect(gradleTarget({ projectRoot: project(), configured: undefined, args })).toEqual(
      plain('gradle'),
    );
  });

  it('uses the wrapper at the root of the build when the project is one of its subprojects', () => {
    const root = project({ ...wrapper(), 'settings.gradle': {}, 'server/build.gradle': {} });

    expect(
      gradleTarget({ projectRoot: path.join(root, 'server'), configured: undefined, args }),
    ).toEqual(plain(path.join(root, 'gradlew')));
  });

  it('prefers the wrapper of the project over one further up', () => {
    const root = project({ ...wrapper(), 'settings.gradle': {}, 'server/gradlew': EXECUTABLE });

    expect(
      gradleTarget({ projectRoot: path.join(root, 'server'), configured: undefined, args }),
    ).toEqual(plain(path.join(root, 'server', 'gradlew')));
  });

  it('does not look above the root of the build or the repository', () => {
    const outer = project({ ...wrapper(), 'inner/settings.gradle': {}, 'other/.git': {} });

    for (const inner of ['inner', 'other']) {
      expect(
        gradleTarget({ projectRoot: path.join(outer, inner), configured: undefined, args }),
      ).toEqual(plain('gradle'));
    }
  });

  it('uses the Maven wrapper at the root of the reactor for one of its modules', () => {
    const root = project({ mvnw: EXECUTABLE, '.mvn/maven.config': {}, 'api/pom.xml': {} });

    expect(
      mavenTarget({
        projectRoot: path.join(root, 'api'),
        configured: undefined,
        args,
        platform: 'linux',
      }),
    ).toEqual(plain(path.join(root, 'mvnw')));
  });

  it('reads the Gradle version the build pins, from the nearest wrapper properties', () => {
    const root = project({
      'settings.gradle': {},
      'gradle/wrapper/gradle-wrapper.properties': {
        text: 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.9.1-bin.zip\n',
      },
    });
    mkdirSync(path.join(root, 'server'));

    expect(pinnedGradleVersion(path.join(root, 'server'))).toBe('9.9.1');
    expect(pinnedGradleVersion(project({ 'settings.gradle': {} }))).toBeUndefined();
  });

  it('turns Isolated Projects off when the build turns it on, since nitpicker runs without the configuration cache', () => {
    const root = project({
      ...wrapper(),
      'gradle.properties': {
        text: 'org.gradle.configuration-cache=true\norg.gradle.isolated-projects=true\n',
      },
      'settings.gradle': {},
    });

    expect(gradleTarget({ projectRoot: root, configured: undefined, args })).toEqual(
      plain(path.join(root, 'gradlew'), ['-Dorg.gradle.isolated-projects=false', ...args]),
    );
    expect(isolatedProjectsOff(project({ 'settings.gradle': {} }))).toEqual([]);
  });

  it('reads Isolated Projects from the Gradle user home and under its earlier property name', () => {
    const userHome = project({
      'gradle.properties': { text: 'org.gradle.unsafe.isolated-projects = true\n' },
    });
    const root = project({
      'settings.gradle': {},
      'gradle.properties': { text: 'org.gradle.isolated-projects=false\n' },
    });

    expect(isolatedProjectsOff(root, { GRADLE_USER_HOME: userHome })).toEqual([
      '-Dorg.gradle.unsafe.isolated-projects=false',
    ]);
  });

  it('does not take a directory for the wrapper', () => {
    const root = project();
    mkdirSync(path.join(root, 'gradlew'));

    expect(gradleTarget({ projectRoot: root, configured: undefined, args })).toEqual(
      plain('gradle'),
    );
  });
});

describe('gradleTarget on Windows', () => {
  const args = ['-I', 'C:\\a b\\init.gradle'];

  it('runs gradlew.bat through a shell with quoted words', () => {
    const root = project({ 'gradlew.bat': { text: '@echo off\n' } });

    expect(
      gradleTarget({ projectRoot: root, configured: undefined, args, platform: 'win32' }),
    ).toEqual({
      command: `"${path.join(root, 'gradlew.bat')}"`,
      args: ['"-I"', '"C:\\a b\\init.gradle"'],
      shell: true,
    });
  });

  it('runs the gradle fallback through a shell with quoted words, since it is gradle.bat', () => {
    expect(
      gradleTarget({ projectRoot: project(), configured: undefined, args, platform: 'win32' }),
    ).toEqual({
      command: 'gradle',
      args: ['"-I"', '"C:\\a b\\init.gradle"'],
      shell: true,
    });
  });

  it('starts a configured program as it is and a configured batch file through a shell', () => {
    const root = project({ 'gradlew.bat': { text: '@echo off\n' } });

    expect(
      gradleTarget({ projectRoot: root, configured: 'gradle.exe', args, platform: 'win32' }),
    ).toEqual({
      command: 'gradle.exe',
      args,
      shell: false,
    });
    expect(
      gradleTarget({
        projectRoot: root,
        configured: 'C:\\my project\\gradle.cmd',
        args: ['-q'],
        platform: 'win32',
      }),
    ).toEqual({
      command: '"C:\\my project\\gradle.cmd"',
      args: ['"-q"'],
      shell: true,
    });
  });
});

describe.skipIf(process.platform === 'win32')('analyzeJavaSnapshot', () => {
  const failing = '#!/bin/sh\necho "ran $0 in $PWD" >&2\nexit 1\n';
  function messageOf(root: string, options: { readonly gradle: string | undefined }): string {
    return textOf(analyzeJavaSnapshot(root, options).findings[0]?.message);
  }

  it('runs the wrapper of the analyzed project when no command is configured', () => {
    const root = project(wrapper(failing));

    expect(messageOf(root, { gradle: undefined })).toBe(
      'Java preset failed on your change: ran gradlew in . ' + textOf(linkSentence('gradleFails')),
    );
  });

  it('runs a wrapper without the executable bit through sh', () => {
    const root = project({ gradlew: { text: failing, mode: 0o644 } });

    expect(messageOf(root, { gradle: undefined })).toBe(
      'Java preset failed on your change: ran gradlew in . ' + textOf(linkSentence('gradleFails')),
    );
  });

  it('runs the wrapper at the root of the build for a project on one of its subprojects', () => {
    const root = project({ ...wrapper(failing), 'settings.gradle': {}, 'server/build.gradle': {} });

    expect(messageOf(path.join(root, 'server'), { gradle: undefined })).toBe(
      `Java preset failed on your change: ran ${root}/gradlew in . ${textOf(linkSentence('gradleFails'))}`,
    );
  });

  it('says so when the gradle on the PATH ran although the build pins another version', () => {
    const tools = project({ gradle: { text: failing, mode: 0o755 } });
    const root = project({
      'settings.gradle': {},
      'gradle/wrapper/gradle-wrapper.properties': {
        text: 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.9.1-all.zip\n',
      },
    });
    const previousPath = process.env['PATH'];
    process.env['PATH'] = `${tools}${path.delimiter}${previousPath ?? ''}`;
    try {
      expect(messageOf(root, { gradle: undefined })).toContain(
        'The build pins Gradle 9.9.1 in gradle/wrapper/gradle-wrapper.properties, but no gradlew script',
      );
    } finally {
      process.env['PATH'] = previousPath;
    }
  });

  it('runs the configured command instead of the wrapper', () => {
    const root = project(wrapper(failing));
    const other = project({
      'other-gradle': { text: failing.replace('ran', 'configured'), mode: 0o755 },
    });

    expect(messageOf(root, { gradle: path.join(other, 'other-gradle') })).toBe(
      `Java preset failed on your change: configured ${other}/other-gradle in . ${textOf(linkSentence('gradleFails'))}`,
    );
  });
});
