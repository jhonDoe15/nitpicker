import { describe, expect, it } from 'vitest';
import { rebaseGlobs, shownRootDir } from './jest-coverage.mjs';

const GLOBS = ['src/**/*.ts', '!src/**/*.spec.*', '!**/dist/**'];

describe('the coverage globs nitpicker gives Jest', () => {
  it('keeps them when Jest runs from the project root', () => {
    expect(rebaseGlobs(GLOBS, { projectRoot: '/p', rootDir: '/p' })).toEqual(GLOBS);
  });

  it('rebases them onto a rootDir inside the project, as the NestJS config sets it', () => {
    expect(rebaseGlobs(GLOBS, { projectRoot: '/p', rootDir: '/p/src' })).toEqual([
      '**/*.ts',
      '../src/**/*.ts',
      '!**/*.spec.*',
      '!../src/**/*.spec.*',
      '!**/dist/**',
      '!../**/dist/**',
    ]);
  });

  it('prefixes them with the project folder when the rootDir is above the project', () => {
    expect(rebaseGlobs(GLOBS, { projectRoot: '/repo/packages/a', rootDir: '/repo' })).toEqual([
      'packages/a/src/**/*.ts',
      '!packages/a/src/**/*.spec.*',
      '!packages/a/**/dist/**',
    ]);
  });

  it('only reaches up for globs that name no file under the rootDir', () => {
    expect(
      rebaseGlobs(['src/**/*.ts', '*/lib/**'], { projectRoot: '/p', rootDir: '/p/test' }),
    ).toEqual(['../src/**/*.ts', 'lib/**', '../*/lib/**']);
  });

  it('drops a glob that names the rootDir itself rather than files in it', () => {
    expect(rebaseGlobs(['src'], { projectRoot: '/p', rootDir: '/p/src' })).toEqual(['../src']);
  });
});

describe('the rootDir Jest prints for --showConfig', () => {
  it('is read from the global config after any other output', () => {
    const config = { configs: [{ rootDir: '/p/src' }], globalConfig: { rootDir: '/p/src' } };
    const result = {
      status: 0,
      stdout: `ready\n${JSON.stringify(config, null, '  ')}\n`,
      stderr: '',
    };

    expect(shownRootDir(result)).toBe('/p/src');
  });

  it('is an error when Jest could not load the config', () => {
    const result = { status: 1, stdout: '', stderr: 'Validation Error: rootDir not found' };

    expect(() => shownRootDir(result)).toThrow(
      new Error(
        'Jest exited 1 without printing its config for --showConfig\nProcess output:\n' +
          'Validation Error: rootDir not found',
      ),
    );
  });
});
