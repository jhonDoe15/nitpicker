import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { rule } from './react-no-random-key.mjs';
import { createReactRuleTester } from '../test-support/tester.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-key-helpers-'));
mkdirSync(path.join(root, 'src/shared'), { recursive: true });
mkdirSync(path.join(root, 'src/ui'), { recursive: true });
writeFileSync(
  path.join(root, 'src/shared/ids.ts'),
  [
    "import { nanoid } from 'nanoid';",
    'export function genId(): string { return nanoid(); }',
    'export const timeId = (): string => `t-${String(Date.now())}`;',
    'export const stableId = (item: { id: string }): string => item.id;',
    'export function loggedId(item: { id: string }): string { track(Math.random()); return item.id; }',
    'function hidden(): number { return Math.random(); }',
    'export { hidden };',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const filename = path.join(root, 'src/ui/rows.tsx');

function row(prefix, key) {
  return `${prefix}\nexport function Rows({ items }) { return items.map((item) => <li key={${key}}>{item.name}</li>); }`;
}

const tester = createReactRuleTester();

tester.run('react-no-random-key through helpers', rule, {
  valid: [
    row("import { stableId } from '../shared/ids';", 'stableId(item)'),
    row("import { loggedId } from '../shared/ids';", 'loggedId(item)'),
    row("import { hidden } from '../shared/ids';", 'hidden()'),
    row("import { genId } from '../shared/missing';", 'genId()'),
    row("import { genId } from 'id-kit';", 'genId()'),
    row("import ids from '../shared/ids';", 'ids()'),
    row(
      'function makeKey() { return other(); } function other() { return Math.random(); }',
      'makeKey()',
    ),
    row('function makeKey(item) { track(Math.random()); return item.id; }', 'makeKey(item)'),
    row('function makeKey() { const next = () => Math.random(); return 1; }', 'makeKey()'),
  ].map((code) => ({ filename, code })),
  invalid: [
    [row('function makeKey() { return Math.random(); }', 'makeKey()'), 'makeKey'],
    [
      row("import { nanoid } from 'nanoid'; const makeKey = () => `k-${nanoid()}`;", 'makeKey()'),
      'makeKey',
    ],
    [row("import { genId } from '../shared/ids';", 'genId()'), 'genId'],
    [row("import { timeId as next } from '../shared/ids';", 'next()'), 'next'],
    [row("import { genId } from '../shared/ids';", '`${item.id}-${genId()}`'), 'genId'],
    [
      "import { genId } from '../shared/ids';\nexport function Row() { const id = genId(); return <li key={id} />; }",
      'genId',
    ],
  ].map(([code, call]) => ({
    filename,
    code,
    errors: [{ messageId: 'randomKey', data: { call } }],
  })),
});
