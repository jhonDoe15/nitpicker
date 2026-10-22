import { describe, expect, it } from 'vitest';
import { conventionDefinitions } from './definitions.mjs';
import { followedPolicy } from '../diff/git/test-support/followed-policy.mjs';

const BIG_COMMENT = `// ${'x'.repeat(600 * 1024)}\n`;

function followed(files, config) {
  return followedPolicy(files, config).conventions;
}

const code = 'export const a = 1;\n';
const marked = `// @generated\n${code}`;

describe('file name casing in the head policy', () => {
  it('counts only source and test roots, not fixtures, generated code or other folders', () => {
    expect(
      followed({
        'src/kebab-one.ts': code,
        'src/kebab-two.ts': code,
        'src/__generated__/snake_one.ts': marked,
        'src/api/snake_pb.ts': marked,
        'scripts/snake_three.ts': code,
        'scripts/snake_four.ts': code,
        'e2e/snake_five.ts': code,
        'tests/fixtures/snake_six.ts': code,
        '.storybook/snake_seven.ts': code,
      }),
    ).toBeUndefined();
  });

  it('counts files with generated-looking names that carry no generator marker', () => {
    expect(
      followed({
        'src/kebab-one.ts': code,
        'src/__generated__/snake_one.ts': code,
        'src/api/snake_pb.ts': code,
      }),
    ).toEqual({ 'typescript.fileNames': 'snake_case' });
  });

  it('counts test roots and files too large to read', () => {
    expect(
      followed({
        'src/kebab-one.ts': code,
        'src/snake_big_one.ts': BIG_COMMENT,
        'src/snake_big_two.ts': BIG_COMMENT,
        'tests/snake_test_one.ts': code,
      }),
    ).toEqual({ 'typescript.fileNames': 'snake_case' });
  });

  it('follows the layout of the config', () => {
    expect(
      followed(
        {
          'lib/snake_one.ts': code,
          'lib/snake_two.ts': code,
          'src/kebab-one.ts': code,
        },
        { preset: 'typescript', layout: { sourceRoots: ['lib'] } },
      ),
    ).toEqual({ 'typescript.fileNames': 'snake_case' });
  });
});

describe('pinned conventions in the head policy', () => {
  const policyFor = (config) =>
    followedPolicy({ 'src/kebab-one.ts': 'export const a = 1;\n' }, config);

  it('records a pin even when it equals the default, so the rule can skip the folder majority', () => {
    const policy = policyFor({
      preset: 'typescript',
      conventions: { 'typescript.fileNames': 'kebab-case' },
    });

    expect(policy.conventionPins).toEqual({ 'typescript.fileNames': 'kebab-case' });
    expect(policy.conventions).toBeUndefined();
  });

  it('leaves the pins out of the policy when nothing is pinned', () => {
    expect(policyFor({ preset: 'typescript' }).conventionPins).toBeUndefined();
  });
});

describe('conventions per preset', () => {
  const nonPrettierIds = (preset) =>
    conventionDefinitions(preset)
      .map(({ id }) => id)
      .filter((id) => !id.startsWith('prettier.'));

  it('offers type import style to the typescript preset only', () => {
    expect(nonPrettierIds('typescript')).toEqual([
      'typescript.fileNames',
      'typescript.assertionHelpers',
      'typescript.typeImports',
    ]);
    expect(nonPrettierIds('javascript')).toEqual([
      'typescript.fileNames',
      'typescript.assertionHelpers',
    ]);
  });

  it('offers the JSX conventions to the typescript preset only', () => {
    const jsxIds = (preset) =>
      conventionDefinitions(preset)
        .map(({ id }) => id)
        .filter((id) => id.startsWith('prettier.jsx') || id === 'prettier.bracketSameLine');

    expect(jsxIds('typescript')).toEqual(['prettier.jsxQuotes', 'prettier.bracketSameLine']);
    expect(jsxIds('javascript')).toEqual([]);
  });
});
