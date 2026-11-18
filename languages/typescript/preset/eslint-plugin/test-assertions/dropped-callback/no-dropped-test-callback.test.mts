import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-dropped-test-callback.mts';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-dropped-callback-')));
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
writeFileSync(
  path.join(root, 'src/library.ts'),
  [
    'export type Unsubscribe = () => void;',
    'export type Context = { sessions: number };',
    'export declare const store: { watchers(count: number): () => void; track(atom: string, onChange: () => void): () => void };',
    'export declare const later: { stop(): Unsubscribe };',
    'export declare function libraryCheck(count: number): (context: Context) => void;',
  ].join('\n'),
);

mkdirSync(path.join(root, 'src/test-support'));
writeFileSync(
  path.join(root, 'src/test-support/checks.ts'),
  'export declare function supportCheck(count: number): (context: { sessions: number }) => void;\n',
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

const PRELUDE = [
  'type Context = { sessions: number };',
  'declare function hasSessions(count: number): (context: Context) => void;',
  'declare function load(): number;',
  'declare function run(check: (context: Context) => void): void;',
  'declare const stub: (() => void) & { calls: number };',
  'declare function makeStub(): (() => void) & { calls: number };',
  'declare function makeCheck(): { run(): void };',
  'declare const bus: { on(event: string, handler: () => void): () => void; fire(): () => void };',
  'declare function subscribe(listener: () => void): () => void;',
  'type Unsubscribe = () => void;',
  'declare function schedule(task: () => () => void): () => void;',
].join('\n');

type Typed = { filename: string; code: string };

function typed(body: string, errors?: 0): Typed;
function typed(body: string, errors: number): Typed & { errors: { messageId: string }[] };
function typed(body: string, errors = 0) {
  const file = path.join(root, `src/case-${randomUUID()}.test.ts`);
  const code = `${PRELUDE}\n${body}`;
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(errors === 0
      ? {}
      : { errors: Array.from({ length: errors }, () => ({ messageId: 'dropped' })) }),
  };
}

tester.run('no-dropped-test-callback', rule, {
  valid: [
    typed('hasSessions(1)({ sessions: 1 });'),
    typed('run(hasSessions(1));'),
    typed('const check = hasSessions(1);\ncheck({ sessions: 1 });'),
    typed('load();'),
    typed('subscribe(() => {});'),
    typed("import { store } from './library';\nstore.track('a', () => {});"),
    typed("import { later } from './library';\nlater.stop();"),
    typed("import { store } from './library';\nstore.watchers(1);"),
    typed("import { libraryCheck } from './library';\nlibraryCheck(1);"),
    typed(
      'declare const sub: (atom: string, listener: () => void) => () => void;\nsub("a", () => {});',
    ),
    typed(
      'declare const track: (atom: string, listener: () => void) => () => void;\ntrack("a", () => {});',
    ),
    typed('declare const stop: () => Unsubscribe;\nstop();'),
    typed("bus.on('x', () => {});"),
    typed('schedule(() => () => {});'),
    typed('makeCheck().run();'),
    typed('makeStub();'),
    typed('run((context) => { hasSessions(1)(context); });'),
    typed('const make = () => (context: Context) => hasSessions(1)(context);\nexport { make };'),
    typed('const lazy: () => () => void = () => hasSessions(1);\nexport { lazy };'),
  ],
  invalid: [
    typed('hasSessions(1);', 1),
    typed("import { supportCheck } from './test-support/checks';\nsupportCheck(1);", 1),
    typed('declare const track: (atom: string) => () => void;\ntrack("a");', 1),
    typed('run((context) => hasSessions(1));', 1),
    typed('run((context) => { hasSessions(1); });', 1),
    typed('function check() {\n  hasSessions(1);\n  hasSessions(2);\n}', 2),
  ],
});
