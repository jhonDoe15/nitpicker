import { describe, expect, it } from 'vitest';
import {
  MOCHA_RC_FILES,
  PACKAGE_JSON,
  mochaConfigFiles,
  mochaSources,
} from './mocha-config-files.mjs';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

const { projectWith } = useTemporaryProjects('nitpicker-mocha-files-');

const MANIFEST = JSON.stringify({ name: 'p', mocha: { retries: 1 } });

describe('the config files Mocha reads', () => {
  it('lists the rc files in the order Mocha 12 looks for them', () => {
    expect(MOCHA_RC_FILES).toEqual([
      '.mocharc.cjs',
      '.mocharc.js',
      '.mocharc.mjs',
      '.mocharc.yaml',
      '.mocharc.yml',
      '.mocharc.jsonc',
      '.mocharc.json',
    ]);
  });

  it.each(MOCHA_RC_FILES.map((name, index) => [name, MOCHA_RC_FILES.slice(index)]))(
    'finds %s ahead of the rc files after it',
    (name, present) => {
      const root = projectWith(Object.fromEntries(present.map((file) => [file, '{}'])));

      expect(mochaSources(root).config).toBe(name);
    },
  );

  it('uses the package.json that holds the mocha key, and skips a directory named like an rc file', () => {
    const root = projectWith({ 'package.json': MANIFEST, '.mocharc.json/keep': 'x' });

    expect(mochaSources(root)).toEqual({ config: undefined, package: PACKAGE_JSON });
    expect(mochaConfigFiles(root)).toEqual([{ file: PACKAGE_JSON, label: 'package.json "mocha"' }]);
  });

  it('follows the --config and --package options of the script and their negations', () => {
    const root = projectWith({
      '.mocharc.json': '{}',
      'package.json': MANIFEST,
      'm/rc.yml': 'a: 1',
    });

    expect(mochaSources(root, ['--config', 'm/rc.yml', '--package=m/pkg.json'])).toEqual({
      config: 'm/rc.yml',
      package: 'm/pkg.json',
    });
    expect(mochaSources(root, ['--no-config', '--no-package'])).toEqual({
      config: undefined,
      package: undefined,
    });
    expect(mochaConfigFiles(root, ['--no-config'])).toEqual([
      { file: PACKAGE_JSON, label: 'package.json "mocha"' },
    ]);
  });

  it('names no file for a package.json without a mocha key or with invalid JSON', () => {
    expect(mochaConfigFiles(projectWith({ 'package.json': '{ "name": "p" }' }))).toEqual([]);
    expect(mochaConfigFiles(projectWith({ 'package.json': '{ nope' }))).toEqual([]);
  });
});
