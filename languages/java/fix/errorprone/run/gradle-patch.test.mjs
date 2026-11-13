import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../../builds/java-build.mjs';
import { gradleArguments, patchFlags, runGradlePatch } from './gradle-patch.mjs';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('patchFlags', () => {
  it('names the checks and a patch folder, never the in-place location', () => {
    expect(patchFlags({ checks: ['A', 'B'], patchRoot: '/work/patches' })).toEqual([
      '-XepPatchChecks:A,B',
      '-XepPatchLocation:/work/patches',
    ]);
  });
});

describe('gradleArguments', () => {
  it('runs the init script task of the gate with the settings file and a report folder', () => {
    expect(gradleArguments({ settingsFile: '/w/s.json', reportRoot: '/w/r' })).toEqual([
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      '-Pnitpicker.reportDir=/w/r',
      '-Pnitpicker.errorprone.settings=/w/s.json',
      '-I',
      INIT_SCRIPT,
      'nitpickerErrorProne',
    ]);
  });
});

describe('runGradlePatch', () => {
  it('writes the declared flags and the patch flags to the settings file, and runs gradle once', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-patch-'));
    directories.push(work);
    const calls = [];

    const { patchRoot, reportRoot } = runGradlePatch({
      projectRoot: '/project',
      environment: { NITPICKER_GRADLE: '/opt/gradle' },
      work,
      flags: ['-XepOpt:Foo=bar'],
      checks: ['MissingOverride'],
      executeFixCommand(invocation) {
        calls.push(invocation);
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const [call] = calls;
    const settings = call.args
      .find((argument) => argument.startsWith('-Pnitpicker.errorprone.settings='))
      .split('=')[1];

    expect([call.operation, call.command, call.cwd]).toEqual([
      'error-prone-patch',
      '/opt/gradle',
      '/project',
    ]);
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual([
      '-XepOpt:Foo=bar',
      '-XepPatchChecks:MissingOverride',
      `-XepPatchLocation:${patchRoot}`,
    ]);
    expect(reportRoot).toBe(path.join(work, 'reports'));
  });

  it('throws with the output of a failed run', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-patch-'));
    directories.push(work);

    expect(() =>
      runGradlePatch({
        projectRoot: '/project',
        work,
        flags: [],
        checks: ['A'],
        executeFixCommand: () => ({ status: 1, stdout: '', stderr: 'boom' }),
      }),
    ).toThrow(/error-prone-patch failed: boom/u);
  });
});
