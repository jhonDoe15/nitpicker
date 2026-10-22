import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './exhaustive-union-predicate.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-union-predicate-')));
mkdirSync(path.join(root, 'node_modules/ext-lib'), { recursive: true });
writeFileSync(
  path.join(root, 'node_modules/ext-lib/index.d.ts'),
  [
    "export type LibKind = 'a' | 'b' | 'c';",
    'export declare function libKind(): LibKind;',
    "export declare const lib: { kind: 'a' | 'b' | 'c'; named: LibKind };",
    '',
  ].join('\n'),
);
writeFileSync(
  path.join(root, 'node_modules/ext-lib/package.json'),
  JSON.stringify({ name: 'ext-lib', version: '1.0.0', types: 'index.d.ts' }),
);
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
writeFileSync(path.join(root, 'src/kinds.ts'), "export type SharedKind = 'x' | 'y' | 'z';\n");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

let counter = 0;

function typed(code, errors) {
  counter += 1;
  const file = path.join(root, `src/case-${String(counter)}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

const kind = "type Kind = 'a' | 'b' | 'c' | 'd';\n";
const event = "type Event = { type: 'a' } | { type: 'b' } | { type: 'c' };\n";
const lib = "import { lib, libKind } from 'ext-lib';\nimport type { LibKind } from 'ext-lib';\n";

function partial(union) {
  return [{ messageId: 'partialUnionTest', data: { union } }];
}

tester.run('exhaustive-union-predicate', rule, {
  valid: [
    `${kind}export const f = (k: Kind) => k === 'a' || k === 'b' || k === 'c' || k === 'd';`,
    `${kind}export const f = (k: Kind) => k !== 'a' && k !== 'b' && k !== 'c' && k !== 'd';`,
    `${kind}export const f = (k: Kind, j: Kind) => k === 'a' || j === 'b';`,
    `${kind}export const f = (k: Kind, other: Kind) => k === 'a' || k === other;`,
    `${kind}export const f = (k: Kind, flag: boolean) => k === 'a' || k === 'b' || flag;`,
    `${kind}export const f = (k: Kind) => k === 'a';`,
    `${kind}export const f = (k: Kind) => k !== 'a' || k !== 'b';`,
    `${kind}export const f = (k: Kind) => k === 'a' && k === 'b';`,
    `${kind}export const f = (k: Kind) => k == 'a' || k == 'b';`,
    `${kind}export const f = (k: Kind) => { switch (k) { case 'a': case 'b': return true; case 'c': case 'd': return false; } };`,
    `${kind}export const f = (k: Kind) => ({ a: true, b: true, c: false, d: false })[k];`,
    `${kind}declare function get(): Kind;\nexport const f = () => get() === 'a' || get() === 'b';`,
    "export const f = (s: string) => s === 'a' || s === 'b';",
    "export const f = (k: 'a' | 'b') => k === 'a' || k === 'b';",
    "type Two = 'a' | 'b'; export const f = (k: Two) => k === 'a' || k === 'b';",
    'export const f = (k: boolean) => k === true || k === false;',
    `${event}export const f = (e: Event) => e.type === 'a' || e.type === 'b';`,
    `${event}export const f = (e: Event | undefined) => e?.type === 'a' || e?.type === 'b';`,
    `${event}export const f = (e: Event) => e.type !== 'a' && e.type !== 'b';`,
    `${lib}export const f = (k: LibKind) => k === 'a' || k === 'b';`,
    `${lib}export const f = () => { const k = libKind(); return k === 'a' || k === 'b'; };`,
    `${lib}export const f = () => lib.kind === 'a' || lib.kind === 'b';`,
    `${lib}export const f = () => lib.named === 'a' || lib.named === 'b';`,
    `${lib}export const f = () => { const kind = lib.kind; return kind === 'a' || kind === 'b'; };`,
    `${lib}export const f = () => { const { kind } = lib; return kind === 'a' || kind === 'b'; };`,
    `${lib}export const f = ({ kind }: { kind: LibKind }) => kind === 'a' || kind === 'b';`,
    `${lib}export const f = ({ kind }: typeof lib) => kind === 'a' || kind === 'b';`,
    `${lib}export const f = (k: LibKind) => { if (k === 'c') { return false; } return k === 'a' || k === 'b'; };`,
    "type Mode = 'a' | 'b' | 'c'; export const f = (m: Mode) => { const x = `${m}` === 'a' || `${m}` === 'b'; return x; };",
    "export const f = (k: 'a' | 'b' | 'c') => 'a' === 'a' || 'b' === 'b';",
    `${kind}export function isEarly(k: Kind): k is 'a' | 'b' { return k === 'a' || k === 'b'; }`,
    `${kind}export const isEarly = (k: Kind): k is 'a' | 'b' => k === 'a' || k === 'b';`,
    `${kind}export const isEarly = (k: Kind): k is 'c' | 'd' => k !== 'a' && k !== 'b';`,
    `${kind}export function assertEarly(k: Kind): asserts k is 'a' | 'b' { if (k !== 'a' && k !== 'b') { throw new Error('x'); } }`,
    `${kind}export function f(k: Kind) { if (k === 'a' || k === 'b') { return 1; } return 2; }`,
    `${kind}export function f(k: Kind) { return k === 'a' ? 1 : k === 'b' || k === 'c' ? 2 : 3; }`,
    `${kind}export function f(k: Kind) { while (k === 'a' || k === 'b') { k = next(); } return k; }\ndeclare function next(): Kind;`,
    `${kind}export function f(k: Kind) { for (; k !== 'a' && k !== 'b'; ) { k = next(); } return k; }\ndeclare function next(): Kind;`,
    `${kind}export const f = (k: Kind, run: (v: boolean) => void) => run(k === 'a' || k === 'b');`,
  ].map((code) => typed(code)),
  invalid: [
    typed(`${kind}export const f = (k: Kind) => k === 'a' || k === 'b';`, partial('`Kind`')),
    typed(
      `${kind}export function f(k: Kind) { return k === 'a' || k === 'b' || k === 'c'; }`,
      partial('`Kind`'),
    ),
    typed(`${kind}export const f = (k: Kind) => k !== 'a' && k !== 'b';`, partial('`Kind`')),
    typed(
      `${kind}export function f(k: Kind) { const done = k === 'a' || k === 'b'; return done; }`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export function f(k: Kind) { if (k === 'd') { return false; } return k === 'a' || k === 'b'; }`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export const f = (k: Kind, on: boolean) => on && !(k === 'a' || k === 'b');`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export function f(k: Kind) { let done = false; done = k === 'a' || k === 'b'; return done; }`,
      partial('`Kind`'),
    ),
    typed(`${kind}export const f = (k: Kind) => 'a' === k || 'b' === k;`, partial('`Kind`')),
    typed(
      `${kind}export const f = (k: Kind) => (k === 'a' || k === 'b') || k === 'c';`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export const f = (k: Kind | undefined) => k === 'a' || k === 'b';`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}type Props = { kind?: Kind };\nexport const f = (p: Props) => p.kind === 'a' || p.kind === 'b';`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export const f = ({ kind: k }: { kind: Kind }) => k === 'a' || k === 'b';`,
      partial('`Kind`'),
    ),
    typed("export const f = (k: 'a' | 'b' | 'c') => k === 'a' || k === 'b';", partial('the union')),
    typed(
      'type Level = 1 | 2 | 3 | 4; export const f = (l: Level) => l === 1 || l === 2;',
      partial('`Level`'),
    ),
    typed(
      "import type { SharedKind } from './kinds';\nexport const f = (k: SharedKind) => k === 'x' || k === 'y';",
      partial('`SharedKind`'),
    ),
    typed(
      `${kind}export function f(k: Kind): boolean { return k === 'a' || k === 'b'; }`,
      partial('`Kind`'),
    ),
    typed(
      `${kind}export const f = (k: Kind, j: Kind) => k === 'a' || k === 'b' ? j !== 'c' && j !== 'd' : false;`,
      partial('`Kind`'),
    ),
  ],
});
