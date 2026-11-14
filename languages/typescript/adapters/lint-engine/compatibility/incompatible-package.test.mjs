import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { incompatiblePackageMessage, rangeAcceptsMajor } from './incompatible-package.mts';
import { withEngineHint } from '../../oxlint/oxlint-process.mts';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-incompatible-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function installPackage(name, manifest) {
  const directory = path.join(root, 'node_modules', name);
  mkdirSync(path.join(directory, 'dist'), { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, ...manifest }));
  return path.join(directory, 'dist', 'FlatESLint.js');
}

function stackAt(location) {
  return [
    'TypeError: Class extends value undefined is not a constructor or null',
    `    at Object.<anonymous> (${location}:12:49)`,
    '    at Module._compile (node:internal/modules/cjs/loader:1554:14)',
  ].join('\n');
}

const utils = installPackage('@typescript-eslint/utils', {
  version: '8.46.2',
  peerDependencies: { eslint: '^8.57.0 || ^9.0.0' },
});
const modern = installPackage('modern-plugin', {
  version: '2.0.0',
  peerDependencies: { eslint: '^9.0.0 || ^10.0.0' },
});
const loose = installPackage('no-peer', { version: '1.0.0' });
const DETAIL =
  '@typescript-eslint/utils 8.46.2 cannot run with ESLint 10 (it supports eslint ^8.57.0 || ^9.0.0). ' +
  'Update it, or the package that depends on it, to a version that supports ESLint 10. ' +
  'It failed with: TypeError: Class extends value undefined is not a constructor or null.';
const MESSAGE = `${DETAIL} ${linkSentence('incompatibleEslintPackage')}`;

describe('a project package that cannot run on the running ESLint', () => {
  it('keeps the original error when a package manifest cannot be read', () => {
    const broken = installPackage('broken-manifest', { version: '1.0.0' });
    writeFileSync(path.join(root, 'node_modules', 'broken-manifest', 'package.json'), '\uFEFF{');

    expect(incompatiblePackageMessage(stackAt(broken), { cwd: root, major: 10 })).toBeUndefined();
  });

  it('blames only installed packages, not the project, for a path it cannot place', () => {
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'own-plugin', peerDependencies: { eslint: '^8.0.0' } }),
    );

    expect(
      incompatiblePackageMessage(stackAt('user/project/node_modules/x/a.js'), {
        cwd: root,
        major: 10,
      }),
    ).toBeUndefined();
  });

  it('is named with its version, its supported range and what to change', () => {
    expect(incompatiblePackageMessage(stackAt(utils), { cwd: root, major: 10 })).toBe(MESSAGE);
  });

  it('is found from a file URL and from a path relative to the working directory', () => {
    expect(
      incompatiblePackageMessage(stackAt(pathToFileURL(utils).href), { cwd: root, major: 10 }),
    ).toBe(MESSAGE);
    expect(
      incompatiblePackageMessage(stackAt(path.relative(root, utils)), { cwd: root, major: 10 }),
    ).toBe(MESSAGE);
  });

  it('is found in a later frame when an earlier package has no ESLint peer', () => {
    const stack = `${stackAt(loose)}\n    at Object.<anonymous> (${utils}:1:1)`;

    expect(incompatiblePackageMessage(stack, { cwd: root, major: 10 })).toBe(MESSAGE);
  });

  it('is not reported when the package supports the running major, has no peer, or is not in a stack', () => {
    expect(incompatiblePackageMessage(stackAt(utils), { cwd: root, major: 9 })).toBeUndefined();
    expect(incompatiblePackageMessage(stackAt(modern), { cwd: root, major: 10 })).toBeUndefined();
    expect(incompatiblePackageMessage(stackAt(loose), { cwd: root, major: 10 })).toBeUndefined();
    expect(
      incompatiblePackageMessage('SyntaxError: Unexpected token', { cwd: root }),
    ).toBeUndefined();
  });
});

describe('a peer range', () => {
  it.each([
    ['^8.57.0 || ^9.0.0', 10, false],
    ['^8.57.0 || ^9.0.0', 9, true],
    ['>=8', 10, true],
    ['>=8 <10', 10, false],
    ['~10.1.0', 10, true],
    ['*', 10, true],
    ['10.x', 10, true],
    ['>= 8', 10, true],
    ['8 - 10', 9, true],
    ['8 - 9', 10, false],
  ])('%s with major %i accepts: %s', (range, major, accepted) => {
    expect(rangeAcceptsMajor(range, major)).toBe(accepted);
  });
});

describe('the engine advice for an incompatible package', () => {
  it('leaves the message alone instead of suggesting the ESLint engine', () => {
    expect(withEngineHint(MESSAGE)).toBe(MESSAGE);
  });
});
