import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { checksJavascript, projectTsconfigs } from './tsconfig-files.mjs';

const { temporaryRoot } = useGitFixtures();

describe('checksJavascript', () => {
  it('reads checkJs through the tsconfig and what it extends', () => {
    const root = temporaryRoot('nitpicker-check-js-');
    writeFiles(root, {
      'base.json': '{ "compilerOptions": { "checkJs": true } }',
      'tsconfig.json': '{ "extends": "./base.json" }',
      'plain/tsconfig.json': '{}',
    });

    expect([
      checksJavascript(path.join(root, 'tsconfig.json')),
      checksJavascript(path.join(root, 'plain/tsconfig.json')),
    ]).toEqual([true, false]);
  });
});

describe('projectTsconfigs', () => {
  it('finds the root, package and referenced configs, but not dependencies or hidden folders', () => {
    const root = temporaryRoot('nitpicker-project-tsconfigs-');
    const files = {
      'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './config/app.json' }] }),
      'config/app.json': '{ "compilerOptions": { "checkJs": true } }',
      'packages/shared/tsconfig.json': '{}',
      'node_modules/pkg/tsconfig.json': '{}',
      'vendor/lib/tsconfig.json': '{}',
    };
    writeFiles(root, files);

    expect(
      projectTsconfigs(root, Object.keys(files), (file) => file.startsWith('vendor/')),
    ).toEqual(['config/app.json', 'packages/shared/tsconfig.json', 'tsconfig.json']);
  });
});
