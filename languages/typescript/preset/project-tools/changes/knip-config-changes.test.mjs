import { describe, expect, it } from 'vitest';
import { knipConfigChanges } from './knip-config-changes.mjs';

const FILES = ['knip.json'];

function changes(base, head, precedence = ['project', 'nitpicker']) {
  return knipConfigChanges({ base, head, precedence, label: 'knip knip.json', files: FILES });
}

function loosened(text) {
  return { loosened: { text: `knip knip.json ${text}`, kind: 'tool-config', files: FILES } };
}

function changed(text) {
  return { changed: `knip knip.json ${text}` };
}

describe('what an edit of the knip config changes', () => {
  it.each([
    [
      { ignore: ['a/**'] },
      { ignore: ['a/**', 'b/**'] },
      loosened('ignore: ["a/**"] -> ["a/**","b/**"]'),
    ],
    [
      { ignore: ['a/**', 'b/**'] },
      { ignore: 'a/**' },
      changed('ignore: ["a/**","b/**"] -> ["a/**"]'),
    ],
    [{}, { entry: ['src/cli.ts'] }, loosened('entry: not set -> ["src/cli.ts"]')],
    [{}, { ignoreFiles: ['src/x.ts'] }, loosened('ignoreFiles: not set -> ["src/x.ts"]')],
    [
      {},
      { ignoreWorkspaces: ['packages/x'] },
      loosened('ignoreWorkspaces: not set -> ["packages/x"]'),
    ],
    [{}, { project: ['!src/generated/**'] }, loosened('project: not set -> ["!src/generated/**"]')],
    [{ project: ['!a/**'] }, {}, changed('project: ["!a/**"] -> not set')],
    [
      {},
      { ignoreIssues: { 'a.ts': ['exports'] } },
      loosened('ignoreIssues: not set -> {"a.ts":["exports"]}'),
    ],
    [
      { ignoreIssues: { 'a.ts': ['exports', 'types'] } },
      { ignoreIssues: { 'a.ts': ['types'] } },
      changed('ignoreIssues: {"a.ts":["exports","types"]} -> {"a.ts":["types"]}'),
    ],
    [{}, { rules: { exports: 'off' } }, loosened('rules: not set -> {"exports":"off"}')],
    [{}, { vitest: { entry: ['x.ts'] } }, loosened('vitest: not set -> {"entry":["x.ts"]}')],
    [
      {},
      { workspaces: { 'packages/*': { ignore: ['x'] } } },
      loosened('workspaces: not set -> {"packages/*":{"ignore":["x"]}}'),
    ],
    [
      {},
      { ignoreDependencies: [{ $nitpickerRegExp: ['^left-', 'u'] }] },
      loosened('ignoreDependencies: not set -> ["/^left-/u"]'),
    ],
  ])('reads %j -> %j', (base, head, expected) => {
    expect(changes(base, head)).toEqual([expected]);
  });

  it('ignores what the run never applies', () => {
    const base = { project: ['src/**'], $schema: 'a', treatConfigHintsAsErrors: true };
    const head = { project: ['lib/**'], $schema: 'b', compilers: { css: true } };
    expect(changes(base, head)).toEqual([]);
    expect(
      changes({}, { rules: { exports: 'off' }, include: ['files'] }, ['nitpicker', 'project']),
    ).toEqual([]);
    expect(changes({ ignore: ['b', 'a'] }, { ignore: ['a', 'b', 'a'] })).toEqual([]);
  });
});
