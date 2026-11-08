import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import {
  checksJavascript,
  projectTsconfigs,
  tsconfigChain,
  tsconfigProblems,
} from './tsconfig-files.mjs';

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

describe('tsconfigChain', () => {
  const chainOf = (files, entry = 'tsconfig.json', place = '') => {
    const root = temporaryRoot('nitpicker-tsconfig-chain-');
    writeFiles(root, files);
    return tsconfigChain(path.join(root, place), entry);
  };
  const extending = (extended) => JSON.stringify({ extends: extended });

  it('follows an extends array and a target written without .json', () => {
    expect(
      chainOf({
        'tsconfig.json': extending(['./a', './b.json']),
        'a.json': extending('./c'),
        'b.json': '{}',
        'c.json': '{}',
      }),
    ).toEqual(['tsconfig.json', 'a.json', 'b.json', 'c.json']);
  });

  it('reads a target that has a folder of the same name as the .json file', () => {
    expect(
      chainOf({
        'tsconfig.json': extending('./base'),
        'base.json': '{}',
        'base/notes.txt': 'x',
      }),
    ).toEqual(['tsconfig.json', 'base.json']);
    expect(chainOf({ 'tsconfig.json': extending('./base'), 'base/notes.txt': 'x' })).toEqual([
      'tsconfig.json',
    ]);
  });

  it('stops at a cycle and skips missing files, packages and files above the root', () => {
    expect(
      chainOf(
        {
          'outside.json': '{}',
          'app/tsconfig.json': extending(['./a.json', './missing', '@org/cfg', '../outside.json']),
          'app/a.json': extending('./tsconfig.json'),
        },
        'tsconfig.json',
        'app',
      ),
    ).toEqual(['tsconfig.json', 'a.json']);
  });

  it('skips a symlinked config that leaves the project', () => {
    const root = temporaryRoot('nitpicker-tsconfig-links-');
    writeFiles(root, {
      'outside/shared.json': '{}',
      'project/inside.json': '{}',
      'project/tsconfig.json': extending(['./linked.json', './kept.json']),
    });
    symlinkSync(path.join(root, 'outside/shared.json'), path.join(root, 'project/linked.json'));
    symlinkSync(path.join(root, 'project/inside.json'), path.join(root, 'project/kept.json'));

    expect(tsconfigChain(path.join(root, 'project'), 'tsconfig.json')).toEqual([
      'tsconfig.json',
      'kept.json',
    ]);
  });
});

describe('tsconfigProblems', () => {
  const problemsOf = (files) => {
    const root = temporaryRoot('nitpicker-tsconfig-problems-');
    writeFiles(root, files);
    return { root, problems: tsconfigProblems(path.join(root, 'tsconfig.json')) };
  };

  it('reports invalid JSON, a missing extends target and an unknown option', () => {
    const missing = problemsOf({ 'tsconfig.json': '{ "extends": "./missing.json" }' });

    expect(problemsOf({ 'tsconfig.json': '{ "compilerOptions": [' }).problems).toEqual([
      "']' expected.",
    ]);
    expect(missing.problems).toEqual([
      `Cannot read file '${path.join(missing.root, 'missing.json')}'.`,
    ]);
    expect(
      problemsOf({ 'tsconfig.json': '{ "compilerOptions": { "noSuchOption": true } }' }).problems,
    ).toEqual(["Unknown compiler option 'noSuchOption'."]);
  });

  it('accepts a config without inputs, comments and an extends target next to a folder', () => {
    expect(problemsOf({ 'tsconfig.json': '// none\n{}' }).problems).toEqual([]);
    expect(
      problemsOf({
        'tsconfig.json': '{ "extends": "./base" }',
        'base.json': '{}',
        'base/notes.txt': 'x',
      }).problems,
    ).toEqual([]);
  });
});
