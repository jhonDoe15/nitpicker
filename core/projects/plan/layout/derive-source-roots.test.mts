import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { deriveSourceRoots } from './derive-source-roots.mts';

const createPackage = useTempProjects('nitpicker-derive-roots-');

describe('deriveSourceRoots', () => {
  it('returns undefined when src/ exists or for non-script presets', () => {
    const withSrc = createPackage({
      'package.json': '{"name":"pkg"}',
      'src/index.ts': 'export const value = 1;\n',
    });
    const javaPkg = createPackage({
      'index.ts': 'export const value = 1;\n',
    });

    expect(deriveSourceRoots({ projectRoot: withSrc, preset: 'typescript' })).toBeUndefined();
    expect(deriveSourceRoots({ projectRoot: javaPkg, preset: 'java' })).toBeUndefined();
  });

  it('derives source roots from tsconfig.json include and files when they point to real code', () => {
    const root = createPackage({
      'tsconfig.json': JSON.stringify({
        include: ['views/**/*', 'components/**/*.tsx', 'missing/**/*', 'tests/**/*'],
        files: ['lib/entry.ts'],
      }),
      'views/home.tsx': 'export const Home = () => null;\n',
      'components/button.tsx': 'export const Button = () => null;\n',
      'lib/entry.ts': 'export const entry = 1;\n',
      'tests/home.test.tsx': 'export {};\n',
    });

    expect(deriveSourceRoots({ projectRoot: root, preset: 'typescript' })).toEqual([
      'components',
      'lib',
      'views',
    ]);
  });

  it('collapses to the package root when tsconfig.json includes root files or root globs', () => {
    const root = createPackage({
      'tsconfig.json': JSON.stringify({ include: ['**/*.tsx', 'components/**/*'] }),
      'index.tsx': 'export const app = 1;\n',
      'components/Button.tsx': 'export const Button = () => null;\n',
    });

    expect(deriveSourceRoots({ projectRoot: root, preset: 'typescript' })).toEqual(['.']);
  });

  it('derives from package.json main and exports when tsconfig.json has no usable entries', () => {
    const rootEntry = createPackage({
      'package.json': JSON.stringify({ name: 'app', main: './index.tsx' }),
      'index.tsx': 'export const app = 1;\n',
      'components/Button.tsx': 'export const Button = () => null;\n',
    });
    const libEntry = createPackage({
      'package.json': JSON.stringify({
        name: 'lib',
        exports: { '.': { import: './lib/index.ts', types: './dist/index.d.ts' } },
      }),
      'lib/index.ts': 'export const value = 1;\n',
      'dist/index.d.ts': 'export declare const value: number;\n',
    });

    expect(deriveSourceRoots({ projectRoot: rootEntry, preset: 'typescript' })).toEqual(['.']);
    expect(deriveSourceRoots({ projectRoot: libEntry, preset: 'typescript' })).toEqual(['lib']);
  });

  it('falls back to package root when package.json main points to build output', () => {
    const root = createPackage({
      'package.json': JSON.stringify({ name: 'redux', main: './dist/index.js' }),
      'dist/index.js': 'module.exports = {};\n',
      'actions/users.ts': 'export const loadUsers = () => 1;\n',
      'reducers/users.ts': 'export const users = () => ({});\n',
    });

    expect(deriveSourceRoots({ projectRoot: root, preset: 'typescript' })).toEqual(['.']);
  });

  it('returns undefined when only config, declaration, test, or excluded files exist', () => {
    const root = createPackage({
      'package.json': '{"name":"empty"}',
      'vitest.config.ts': 'export default {};\n',
      'types.d.ts': 'export declare const x: number;\n',
      'tests/sample.test.ts': 'export {};\n',
      'nested/index.ts': 'export const nested = 1;\n',
    });

    expect(
      deriveSourceRoots({ projectRoot: root, preset: 'typescript', exclude: ['nested/**'] }),
    ).toBeUndefined();
  });
});
