import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import {
  checksJavascript,
  projectTsconfigs as untypedProjectTsconfigs,
  tsconfigProblems as untypedTsconfigProblems,
} from './tsconfig-files.mts';

type Files = Readonly<Record<string, string>>;

const projectTsconfigs: (
  projectRoot: string,
  files: readonly string[],
  isHidden: (file: string) => boolean,
) => string[] = untypedProjectTsconfigs;
const tsconfigProblems: (configFile: string) => string[] = untypedTsconfigProblems;

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

describe('tsconfigProblems', () => {
  const problemsOf = (files: Files) => {
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
