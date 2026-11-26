import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unchecked-positional-element.mts';

const tester = typescriptRuleTester();

function script(code: string, filename = '/repo/scripts/signature.mjs') {
  return { filename, code };
}

function invalid(code: string) {
  return { ...script(code), errors: [{ messageId: 'uncheckedElement' as const }] };
}

tester.run('no-unchecked-positional-element', rule, {
  valid: [
    script('const f = ({ children: [first] }) => first === undefined ? 0 : first.length;'),
    script('const f = ({ children: [first] }) => first ? first.length : 0;'),
    script(
      'const f = ({ children: [first] }) => { if (first === undefined) { return 0; } return first.length; };',
    ),
    script('const f = ({ children: [first] }) => first?.length;'),
    script('const f = ({ children: [first = empty] }) => first.length;'),
    script('const f = ({ children: [first] }) => first;'),
    script('const f = ({ children: [first] }) => `${first}`;'),
    script('const f = ({ children: [first] }) => first && keyOf(first);'),
    script('const f = ({ children: [, second] }) => (second ?? fallback).length;'),
    script('const f = ({ children: [first] }) => first.length;', '/repo/src/signature.mts'),
    script('const f = ({ children: [first] }) => first.length;', '/repo/src/signature.ts'),
    script('// @ts-check\nconst f = ({ children: [first] }) => first.length;'),
    script('const f = (tree) => Object.entries(tree.fields).map(([, value]) => keyOf(value));'),
    script('const f = (tree) => [[1, 2]].map(([, second]) => keyOf(second));'),
    script('const f = (tree) => tree.pairs().map(([, second]) => keyOf(second));'),
    script(
      'const f = () => { const rows = load(); return rows.map(([, second]) => keyOf(second)); };',
    ),
    script(
      '/** @param {{ pair: [string, number] }} node */\nconst f = ({ pair: [name, count] }) => keyOf(name, count);',
    ),
    script('const f = (text) => { const [, key] = /a=(.*)/u.exec(text); return keyOf(key); };'),
    script('const f = ({ children: [first] }) => { const g = () => first; return g; };'),
    script('const f = (text, { range: [start, end] }) => text.slice(start, end);'),
    script('const f = ({ size: [w, h] }) => resize(w, h);'),
    script('const f = (opts) => opts.pairs.map(([k, v]) => g(k, v));'),
    script('const f = ({ paths: [b] } = {}) => keyOf(b);'),
    script('const f = ({ opts: { paths: [b] } = {} }) => keyOf(b);'),
    script(
      'const f = (opts) => { const [start, end] = opts.range; return text.slice(start, end); };',
    ),
    script('const f = (opts) => { const [first = empty] = opts.items; return first.length; };'),
    script('const f = (opts) => { const [first] = load(opts); return first.length; };'),
    script('const f = () => { const [first] = shared.items; return first.length; };'),
    script('const f = (tree) => { const [first] = tree.items; return first?.length; };'),
    script('const f = (tree) => { const [first] = tree[key]; return first.length; };'),
    script(
      'const f = (tree) => { const types = tree.children.map(({ children: [type] }) => type); return types.map((type) => type && keyOf(type)); };',
    ),
    script(
      'const f = (tree) => { const types = tree.children.map(({ children: [type] }) => type).filter(Boolean); return types.map((type) => keyOf(type)); };',
    ),
    script(
      'const f = (tree) => { const types = tree.children.map(({ children: [type] }) => type); return types.map((type) => type); };',
    ),
  ],
  invalid: [
    invalid('const f = (tree) => { const [first] = tree.items; return first.length; };'),
    invalid('const f = (tree) => { const [, second] = tree.items; return keyOf(second); };'),
    invalid(
      'const f = (tree) => { const [returned, parameters] = tree.children; return parameters.children; };',
    ),
    invalid(
      'const f = (tree) => { const [returned, parameters] = tree.namedChildren; return keyOf(returned); };',
    ),
    invalid(
      'const f = (tree) => { const types = [tree.head, ...tree.children.map(({ children: [type] }) => type)]; return types.map((type) => keyOf(type)); };',
    ),
    invalid(
      'const f = (tree) => { const types = tree.children.map(({ children: [type] }) => type); return types.map((type) => keyOf(type)); };',
    ),
    invalid(
      'const f = (tree) => { const types = [...tree.children.map(({ children: [type] }) => { return type; })]; return types.map((type) => keyOf(type)); };',
    ),
    invalid('const f = ({ children: [first] }) => keyOf(first);'),
    invalid('const f = ({ children: [first] }) => first.length;'),
    invalid('function f({ node: { children: [, second] } }) { return second.text; }'),
    invalid('const f = (tree) => tree.children.map(({ children: [type] }) => keyOf(type));'),
    invalid('const f = (tree) => tree.children.map(([, second]) => keyOf(second));'),
    invalid('const f = (tree) => tree.nodes.children.forEach(([, second]) => second.visit());'),
    {
      ...script('const f = ({ children: [first] }) => keyOf(first);', '/repo/lib/signature.cjs'),
      errors: [{ messageId: 'uncheckedElement' as const }],
    },
  ],
});
