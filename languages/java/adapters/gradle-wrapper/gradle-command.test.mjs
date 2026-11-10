import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { exactText } from '../../../../core/diff/reporting/test-support/output-expectations.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gradleTarget } from './gradle-command.mjs';
import { analyzeJavaSnapshot } from '../java-runner.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

const roots = [];
let previousGradle;

function project(files = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-')));
  roots.push(root);
  for (const [name, { text = '', mode = 0o644 }] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
    chmodSync(path.join(root, name), mode);
  }
  return root;
}

const wrapper = (text = '#!/bin/sh\nexit 0\n') => ({ gradlew: { text, mode: 0o755 } });

beforeEach(() => {
  previousGradle = process.env.NITPICKER_GRADLE;
  delete process.env.NITPICKER_GRADLE;
});

afterEach(() => {
  if (previousGradle === undefined) {
    delete process.env.NITPICKER_GRADLE;
  } else {
    process.env.NITPICKER_GRADLE = previousGradle;
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('gradleTarget', () => {
  const args = ['--quiet', '-I', 'init.gradle'];
  const plain = (command, commandArgs = args) => ({ command, args: commandArgs, shell: false });

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
  const messageOf = (root, options) => analyzeJavaSnapshot(root, options).findings[0].message;

  it('runs the wrapper of the analyzed project when no command is configured', () => {
    const root = project(wrapper(failing));

    expect(messageOf(root, { gradle: undefined })).toEqual(
      expect.stringMatching(
        exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\nJava preset failed in ${root}: ran ${root}/gradlew in ${root}\n${linkSentence('gradleFails')}`,
      ),
    );
  });

  it('runs a wrapper without the executable bit through sh', () => {
    const root = project({ gradlew: { text: failing, mode: 0o644 } });

    expect(messageOf(root, { gradle: undefined })).toEqual(
      expect.stringMatching(
        exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\nJava preset failed in ${root}: ran ${root}/gradlew in ${root}\n${linkSentence('gradleFails')}`,
      ),
    );
  });

  it('runs the configured command instead of the wrapper', () => {
    const root = project(wrapper(failing));
    const other = project({
      'other-gradle': { text: failing.replace('ran', 'configured'), mode: 0o755 },
    });

    expect(messageOf(root, { gradle: path.join(other, 'other-gradle') })).toEqual(
      expect.stringMatching(
        exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\nJava preset failed in ${root}: configured ${other}/other-gradle in ${root}\n${linkSentence('gradleFails')}`,
      ),
    );
  });
});
