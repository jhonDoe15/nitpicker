import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gradleCommand, spawnTarget } from './gradle-command.mjs';
import { analyzeJavaSnapshot } from '../java-runner.mjs';

const roots = [];

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

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('gradleCommand', () => {
  it('prefers the command that was configured', () => {
    expect(gradleCommand(project(wrapper()), './my-gradle')).toBe('./my-gradle');
  });

  it('uses the executable wrapper of the project, as an absolute path', () => {
    const root = project(wrapper());

    expect(gradleCommand(root, undefined)).toBe(path.join(root, 'gradlew'));
    expect(gradleCommand(root, '')).toBe(path.join(root, 'gradlew'));
  });

  it('falls back to gradle on the PATH without an executable wrapper', () => {
    expect(gradleCommand(project(), undefined)).toBe('gradle');
    expect(gradleCommand(project({ gradlew: { text: 'x', mode: 0o644 } }), undefined)).toBe(
      'gradle',
    );
  });

  it('does not take a directory for the wrapper', () => {
    const root = project();
    mkdirSync(path.join(root, 'gradlew'));

    expect(gradleCommand(root, undefined)).toBe('gradle');
  });
});

describe('gradleCommand on Windows', () => {
  it('uses gradlew.bat when it exists', () => {
    const root = project({ 'gradlew.bat': { text: '@echo off\n' } });

    expect(gradleCommand(root, undefined, 'win32')).toBe(path.join(root, 'gradlew.bat'));
    expect(gradleCommand(project(), undefined, 'win32')).toBe('gradle');
    expect(gradleCommand(root, 'gradle.exe', 'win32')).toBe('gradle.exe');
  });
});

describe('spawnTarget', () => {
  it('starts a program as it is and a batch file through a shell with quoted words', () => {
    expect(spawnTarget('/p/gradlew', ['--quiet'])).toEqual({
      command: '/p/gradlew',
      args: ['--quiet'],
      shell: false,
    });
    expect(spawnTarget('C:\\my project\\gradlew.bat', ['-I', 'C:\\a b\\init.gradle'])).toEqual({
      command: '"C:\\my project\\gradlew.bat"',
      args: ['"-I"', '"C:\\a b\\init.gradle"'],
      shell: true,
    });
  });
});

describe.skipIf(process.platform === 'win32')('analyzeJavaSnapshot', () => {
  const failing = '#!/bin/sh\necho "ran $0 in $PWD" >&2\nexit 1\n';
  const messageOf = (root, options) => analyzeJavaSnapshot(root, options).findings[0].message;

  it('runs the wrapper of the analyzed project when no command is configured', () => {
    const root = project(wrapper(failing));

    expect(messageOf(root, { gradle: undefined })).toBe(
      `Java preset failed in ${root}: ran ${root}/gradlew in ${root}`,
    );
  });

  it('runs the configured command instead of the wrapper', () => {
    const root = project(wrapper(failing));
    const other = project({
      'other-gradle': { text: failing.replace('ran', 'configured'), mode: 0o755 },
    });

    expect(messageOf(root, { gradle: path.join(other, 'other-gradle') })).toBe(
      `Java preset failed in ${root}: configured ${other}/other-gradle in ${root}`,
    );
  });
});
