import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { typecheckProgramRoots as untypedProgramRoots } from './program-roots.mjs';

const typecheckProgramRoots: (projectRoot: string) => string[] = untypedProgramRoots;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function repository(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-program-roots-')));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function reached(root: string, project: string): string[] {
  return typecheckProgramRoots(path.join(root, project))
    .map((directory) => path.relative(root, directory).split(path.sep).join('/'))
    .toSorted();
}

describe('the folders a type check program reaches', () => {
  it('are the project alone without path mappings or references', () => {
    const root = repository({
      'app/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
      'app/src/a.ts': '',
      'bare/src/a.ts': '',
    });

    expect(reached(root, 'app')).toEqual(['app']);
    expect(reached(root, 'bare')).toEqual(['bare']);
  });

  it('include the folders of path mappings, inherited ones too, and of project references', () => {
    const root = repository({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@org/*': ['packages/*/src'],
            '@org/kit': ['libs/kit/index.ts'],
            lodash: ['node_modules/lodash/index.d.ts'],
            '@gone/*': ['removed/*'],
          },
        },
      }),
      'plugins/app/tsconfig.json': JSON.stringify({
        extends: '../../tsconfig.base.json',
        references: [{ path: '../shared' }],
      }),
      'plugins/app/src/a.ts': '',
      'plugins/shared/tsconfig.json': '{}',
      'packages/one/src/a.ts': '',
      'libs/kit/index.ts': '',
      'node_modules/lodash/index.d.ts': '',
    });

    expect(reached(root, 'plugins/app')).toEqual([
      'libs/kit',
      'packages',
      'plugins/app',
      'plugins/shared',
    ]);
  });

  it('count a folder once when one reached folder holds another', () => {
    const root = repository({
      'app/tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '~/*': ['../*'], '@lib/*': ['../lib/*'] } },
      }),
      'lib/a.ts': '',
    });

    expect(reached(root, 'app')).toEqual(['']);
  });

  it('fall back to the project when its tsconfig cannot be read', () => {
    const root = repository({ 'app/tsconfig.json': '{ "extends": 5, ' });

    expect(reached(root, 'app')).toEqual(['app']);
  });
});
