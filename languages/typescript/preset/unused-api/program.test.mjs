import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../core/diff/git/test-support/git-checkout.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { codeFilesUnder, walkRules } from './program.mjs';
import { createProject, removeProject } from './test-support/project.mjs';

const { gitCheckout } = useGitCheckouts();
let root;

function projectWith(files) {
  root = createProject(files);
  symlinkSync(path.join(root, 'src/real'), path.join(root, 'src/linked'));
  symlinkSync(path.join(root, 'src/real/a.ts'), path.join(root, 'src/alias.ts'));
  mkdirSync(path.join(root, 'src/real/deep'));
  writeFileSync(path.join(root, 'src/real/deep/b.ts'), '');
  return walkRules({ projectRoot: root, layout: resolveLayoutFor({ layout: {} }) });
}

afterEach(() => {
  removeProject(root);
});

describe('the files and directories that the walk of a project reaches', () => {
  const files = {
    'src/real/a.ts': '',
    'src/types.d.ts': '',
    'src/notes.md': '',
    'src/.cache/c.ts': '',
    'dist/d.ts': '',
    'src/generated/g.ts': '',
    'generated/g.ts': '',
  };

  it('accepts a code file in a plain directory', () => {
    const rules = projectWith(files);

    expect(rules.isFile(path.join(root, 'src/real/a.ts'))).toBe(true);
    expect(rules.isFile(path.join(root, 'src/real/deep/b.ts'))).toBe(true);
    expect(rules.isDirectory(path.join(root, 'src/real'))).toBe(true);
    expect(rules.isDirectory(root)).toBe(true);
  });

  it('leaves out declaration files, other files, and files that are links', () => {
    const rules = projectWith(files);
    const reached = ['src/types.d.ts', 'src/notes.md', 'src/alias.ts', 'src/missing.ts'].map(
      (file) => rules.isFile(path.join(root, file)),
    );

    expect(reached).toEqual([false, false, false, false]);
  });

  it('leaves out what sits in a dot, built, generated, linked or excluded directory', () => {
    const rules = projectWith(files);
    const directories = ['src/.cache', 'dist', 'generated', 'src/linked', 'node_modules'];

    expect(directories.map((dir) => rules.isDirectory(path.join(root, dir)))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(rules.isFile(path.join(root, 'src/.cache/c.ts'))).toBe(false);
    expect(rules.isFile(path.join(root, 'src/linked/a.ts'))).toBe(false);
    expect(rules.isFile(path.join(root, 'src/linked/deep/b.ts'))).toBe(false);
  });

  it('walks a folder named like build output below the project root', () => {
    const rules = projectWith(files);

    expect(rules.isDirectory(path.join(root, 'src/generated'))).toBe(true);
    expect(rules.isFile(path.join(root, 'src/generated/g.ts'))).toBe(true);
  });

  it('leaves out what lies outside the project', () => {
    const rules = projectWith(files);

    expect(rules.isDirectory(path.dirname(root))).toBe(false);
    expect(rules.isFile(path.join(root, '../elsewhere.ts'))).toBe(false);
  });
});

describe('the consumer files of a sibling package', () => {
  it('include ignored generated code, but not nested checkouts or installed code', () => {
    const checkout = gitCheckout(
      {
        'packages/lib/src/index.ts': '',
        'packages/lib/src/graphql/gql.ts': '',
        'packages/lib/node_modules/dep/index.ts': '',
        ...nestedCheckout('packages/lib/agent', { 'x.ts': '' }),
      },
      ['packages/lib/src/graphql/', 'packages/lib/node_modules/'],
    );
    const layout = resolveLayoutFor({ layout: {} });

    const files = codeFilesUnder([path.join(checkout, 'packages/lib')], layout, checkout);

    expect(files.map((file) => path.relative(checkout, file)).toSorted()).toEqual([
      'packages/lib/src/graphql/gql.ts',
      'packages/lib/src/index.ts',
    ]);
  });
});
