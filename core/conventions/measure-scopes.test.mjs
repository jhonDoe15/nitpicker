import { describe, expect, it } from 'vitest';
import { followedPolicy } from '../diff/git/test-support/followed-policy.mjs';

const test = (helper) => `it('t', () => {\n  run();\n  ${helper}(value);\n});\n`;
const json = (indent) => JSON.stringify({ a: { b: 1 } }, undefined, indent);
const yaml = (indent) => `key:\n${' '.repeat(indent)}nested:\n${' '.repeat(2 * indent)}leaf: 1\n`;
const jsx = (quote, closer) =>
  `export const A = () => (\n  <B\n    one=${quote}1${quote}\n    two=${quote}2${quote}${closer}\n    x\n  </B>\n);\n`;

const FOLLOWED = [
  'prettier.jsonIndentation',
  'prettier.yamlIndentation',
  'prettier.jsxQuotes',
  'prettier.bracketSameLine',
  'typescript.assertionHelpers',
];

function followedOptions(files) {
  const conventions = followedPolicy(files).conventions ?? {};
  return Object.fromEntries(
    FOLLOWED.filter((id) => id in conventions).map((id) => [id, conventions[id]]),
  );
}

describe('conventions measured per scope', () => {
  it('measures JSON and YAML under the source and test roots and at the root only', () => {
    expect(
      followedOptions({
        'package.json': json(4),
        'src/data/a.json': json(4),
        'tests/b.json': json(4),
        'src/config/a.yml': yaml(4),
        'src/config/b.yaml': yaml(4),
        'scripts/c.json': json(2),
        'scripts/d.json': json(2),
        'scripts/e.json': json(2),
        '.github/workflows/ci.yml': yaml(2),
        '.github/workflows/cd.yml': yaml(2),
        '.github/workflows/lint.yml': yaml(2),
        'src/__generated__/g.json': json(2),
      }),
    ).toEqual({ 'prettier.jsonIndentation': '4', 'prettier.yamlIndentation': '4' });
  });

  it('keeps the defaults when the data files in the roots use them', () => {
    expect(followedOptions({ 'src/a.json': json(2), 'src/a.yml': yaml(2) })).toEqual({});
  });

  it('measures JSX options from source and test files', () => {
    expect(
      followedOptions({
        'src/A.tsx': jsx("'", '>'),
        'src/B.tsx': jsx("'", '>'),
        'scripts/C.tsx': jsx('"', ''),
        'scripts/D.tsx': jsx('"', ''),
        'scripts/E.tsx': jsx('"', ''),
      }),
    ).toEqual({ 'prettier.jsxQuotes': 'single', 'prettier.bracketSameLine': 'sameLine' });
  });

  it('measures assertion helpers from test files only', () => {
    expect(
      followedOptions({
        'src/a.test.ts': test('assertOk'),
        'src/b.spec.ts': test('assertOk'),
        'tests/c.ts': test('assertOk'),
        'src/plain-one.ts': test('verifyCalled'),
        'src/plain-two.ts': test('verifyCalled'),
        'src/plain-three.ts': test('verifyCalled'),
        'scripts/x.test.ts': test('checkAll'),
        'scripts/y.test.ts': test('checkAll'),
        'scripts/z.test.ts': test('checkAll'),
      }),
    ).toEqual({ 'typescript.assertionHelpers': ['assertOk'] });
  });
});
