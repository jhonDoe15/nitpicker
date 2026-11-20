import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixWorkingTree } from '../../../core/fix/run-fix.mts';
import { fixOptions, topicRepository, useGitFixtures } from './test-support/fix-test-support.mts';

const { createGitRepository } = useGitFixtures();
const NAME = 'src/main/disabled.ts';

const COMMITTED = {
  'package.json': '{ "name": "demo", "type": "module" }\n',
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'ES2023',
      lib: ['ES2023'],
      types: [],
      noEmit: true,
    },
    include: ['src'],
  }),
};

const WITH_DIRECTIVES = [
  '// eslint-disable-next-line regexp/optimal-quantifier-concatenation',
  String.raw`export const a = /\d+\d*/;`,
  '/* eslint-disable regexp/no-useless-quantifier */',
  'export const b = /a+a+/;',
  '',
].join('\n');

const FIXED_CODE = [String.raw`export const a = /\d+/;`, 'export const b = /a{2,}/;', ''];

function fixed(selectedRules?: readonly string[]): string {
  const repository = topicRepository(createGitRepository, COMMITTED, { [NAME]: WITH_DIRECTIVES });
  const result = fixWorkingTree(
    fixOptions(repository.root, selectedRules === undefined ? {} : { selectedRules }),
  );
  expect(result.toolErrors).toEqual([]);
  return readFileSync(path.join(repository.root, NAME), 'utf8');
}

describe('--fix on findings under inline eslint-disable comments in a gated scope', () => {
  it('treats them as live: a plain fix applies the fixes and removes the comments', () => {
    expect(fixed()).toBe(FIXED_CODE.join('\n'));
  });

  it('applies the selected fixes and keeps the comments when no-comments is not selected', () => {
    expect(
      fixed([
        'eslint-lint/regexp/optimal-quantifier-concatenation',
        'eslint-lint/regexp/no-useless-quantifier',
      ]),
    ).toBe(
      [
        '// eslint-disable-next-line regexp/optimal-quantifier-concatenation',
        FIXED_CODE[0],
        '/* eslint-disable regexp/no-useless-quantifier */',
        FIXED_CODE[1],
        '',
      ].join('\n'),
    );
  });
});
