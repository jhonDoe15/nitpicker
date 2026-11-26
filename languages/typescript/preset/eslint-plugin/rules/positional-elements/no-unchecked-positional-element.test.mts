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
  ],
  invalid: [
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
