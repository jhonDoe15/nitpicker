import { describe, expect, it } from 'vitest';
import { followedPolicy } from '../diff/git/test-support/followed-policy.mjs';

const test = (helper) => `it('t', () => {\n  run();\n  ${helper}(value);\n});\n`;
const helper = (name) => `export function ${name}(value) {\n  expect(value).toBeTruthy();\n}\n`;
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

function followedOptions(files, config) {
  const conventions = followedPolicy(files, config).conventions ?? {};
  return Object.fromEntries(
    FOLLOWED.filter((id) => id in conventions).map((id) => [id, conventions[id]]),
  );
}

describe('conventions measured per scope', () => {
  it('measures the JSON and YAML files Prettier checks, nothing else', () => {
    expect(
      followedOptions({
        'package.json': json(4),
        'tsconfig.json': json(4),
        'eslint.json': json(4),
        'src/a.json': json(2),
        'src/b.yml': yaml(2),
        'tests/c.json': json(4),
        'ci.yml': yaml(4),
        'cd.yaml': yaml(4),
        'lint.yml': yaml(4),
        'tests/d.yml': yaml(4),
        'tests/e.yaml': yaml(4),
        'tests/f.yml': yaml(4),
        'scripts/g.json': json(2),
        'scripts/h.json': json(2),
        'scripts/i.json': json(2),
        'scripts/j.json': json(2),
        'src/fixtures/k.json': json(2),
        'src/fixtures/l.json': json(2),
        'src/fixtures/m.json': json(2),
        'src/fixtures/n.json': json(2),
        'src/__generated__/o.json': json(2),
        'src/__generated__/p.json': json(2),
        'src/__generated__/q.json': json(2),
        'src/__generated__/r.json': json(2),
      }),
    ).toEqual({ 'prettier.jsonIndentation': '4' });
  });

  it('measures YAML under the source roots', () => {
    expect(
      followedOptions({
        'src/config/a.yml': yaml(4),
        'src/config/b.yaml': yaml(4),
        'ci.yml': yaml(2),
      }),
    ).toEqual({ 'prettier.yamlIndentation': '4' });
  });

  it('keeps the defaults when the data files in the roots use them', () => {
    expect(followedOptions({ 'src/a.json': json(2), 'src/a.yml': yaml(2) })).toEqual({});
  });

  it('measures JSX options from source and test files in the typescript preset', () => {
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

  it('measures data files but no JSX in the javascript preset', () => {
    expect(
      followedOptions(
        {
          'src/a.json': json(4),
          'src/b.json': json(4),
          'src/A.jsx': jsx("'", '>'),
          'src/B.jsx': jsx("'", '>'),
        },
        { preset: 'javascript' },
      ),
    ).toEqual({ 'prettier.jsonIndentation': '4' });
  });

  it('measures assertion helpers defined and used in test code only', () => {
    expect(
      followedOptions({
        'src/test-support/asserts.ts': ['assertOk', 'verifyCalled', 'checkAll']
          .map((name) => helper(name))
          .join(''),
        'src/a.test.ts': test('assertOk'),
        'src/b.spec.ts': test('assertOk'),
        'tests/c.ts': test('assertOk'),
        'src/plain-one.ts': test('verifyCalled'),
        'src/plain-two.ts': test('verifyCalled'),
        'src/plain-three.ts': test('verifyCalled'),
        'scripts/x.test.ts': test('checkAll'),
        'scripts/y.test.ts': test('checkAll'),
        'scripts/z.test.ts': test('checkAll'),
        'src/d.test.ts': test('checkIn'),
        'src/e.test.ts': test('checkIn'),
        'src/f.test.ts': test('checkIn'),
      }),
    ).toEqual({ 'typescript.assertionHelpers': ['assertOk'] });
  });
});
