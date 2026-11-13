import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { runRecipes } from '../engine/run-recipes.mjs';
import { sharedInputs } from './shared-inputs.mjs';
import { SHARED_RECIPES } from './shared-recipes.mjs';

const { createGitRepository } = useGitFixtures();

const ENV_RULE = 'repository-hygiene/committed-env-file';
const BUILD_RULE = 'repository-hygiene/committed-build-output';
const KEY_RULE = 'repository-hygiene/committed-private-key';
const STAYS =
  'rotate the key, it stays in the git history, and load the new one from the environment or a secret store';
const BASE = {
  'package.json': '{ "name": "demo" }\n',
  'src/index.js': 'export const a = 1;\n',
  '.env': 'DATABASE_PASSWORD=hunter2\n',
  'build/app.bin': 'compiled\n',
};

function fix(root, selectedRules, headPolicy = {}) {
  const { inputs, toolErrors } = sharedInputs({ projectRoot: root, headPolicy, selectedRules });
  return {
    toolErrors,
    ...runRecipes({
      projectRoot: root,
      files: [],
      recipes: SHARED_RECIPES,
      preset: 'typescript',
      selectedRules,
      accepts: () => false,
      inputs,
    }),
  };
}

function tracked(root) {
  return fixtureGit(root, ['ls-files']).split('\n').filter(Boolean);
}

describe('the untrack-committed-files recipe on a repository', () => {
  it('untracks a tracked .env and a tracked build folder, ignores both and keeps the files', () => {
    const { root } = createGitRepository(BASE);

    const result = fix(root, [ENV_RULE, BUILD_RULE]);

    expect(tracked(root)).toEqual(['package.json', 'src/index.js']);
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('/.env\n/build/\n');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('DATABASE_PASSWORD=hunter2\n');
    expect(existsSync(path.join(root, 'build/app.bin'))).toBe(true);
    expect(result.fixedFindings).toEqual([
      '.env:1 repository-hygiene/committed-env-file (untrack-committed-files)',
      'package.json:1 repository-hygiene/committed-build-output (untrack-committed-files)',
    ]);
    expect(fixtureGit(root, ['log', '--oneline']).trim().split('\n')).toHaveLength(1);
    expect(fixtureGit(root, ['diff', '--cached', '--name-status'])).toBe(
      'D\t.env\nD\tbuild/app.bin\n',
    );
    expect(result.toolErrors).toEqual([]);
  });

  it('appends to an existing .gitignore, keeps its line endings and adds no duplicate', () => {
    const { root } = createGitRepository({ ...BASE, '.gitignore': 'node_modules\r\n.env\r\n' });

    fix(root, [ENV_RULE, BUILD_RULE]);

    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(
      'node_modules\r\n.env\r\n/build/\r\n',
    );
    expect(tracked(root)).not.toContain('.env');
  });

  it('adds a line break before an entry when the .gitignore has none at its end', () => {
    const { root } = createGitRepository({ ...BASE, '.gitignore': 'dist' });

    fix(root, [ENV_RULE]);

    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist\n/.env\n');
  });

  it('runs only when the rule is selected, so a plain --fix leaves the index alone', () => {
    const { root } = createGitRepository(BASE);

    const result = fix(root, []);

    expect(tracked(root)).toEqual(['.env', 'build/app.bin', 'package.json', 'src/index.js']);
    expect(result.fixedFindings).toEqual([]);
  });

  it('untracks a private key but does not claim to have fixed the finding', () => {
    const marker = 'PRIVATE KEY';
    const key = `-----BEGIN RSA ${marker}-----\nabc\n-----END RSA ${marker}-----\n`;
    const { root } = createGitRepository({ ...BASE, 'deploy/id_rsa': key });

    const result = fix(root, [KEY_RULE]);

    expect(tracked(root)).not.toContain('deploy/id_rsa');
    expect(readFileSync(path.join(root, 'deploy/id_rsa'), 'utf8')).toBe(key);
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('/deploy/id_rsa\n');
    expect(result.fixedFindings).toEqual([]);
    expect(result.notes).toEqual([
      `--fix applied deploy/id_rsa:1 repository-hygiene/committed-private-key (untrack-committed-files) but the finding stays: ${STAYS}`,
    ]);
  });

  it('leaves a file the exceptions allow tracked', () => {
    const { root } = createGitRepository(BASE);
    const exceptions = [{ rule: 'committed-env-file', paths: ['.env'], reason: 'fixture' }];

    fix(root, [ENV_RULE], { exceptions });

    expect(tracked(root)).toEqual(['.env', 'build/app.bin', 'package.json', 'src/index.js']);
  });

  it('does not touch other index entries or stage anything', () => {
    const { root } = createGitRepository({ ...BASE, 'staged-later.txt': 'x\n' });
    fixtureGit(root, ['rm', '--cached', '-q', 'staged-later.txt']);

    fix(root, [ENV_RULE]);

    expect(fixtureGit(root, ['status', '--short']).split('\n').filter(Boolean)).toEqual([
      'D  .env',
      'D  staged-later.txt',
      '?? .gitignore',
      '?? staged-later.txt',
    ]);
  });
});
