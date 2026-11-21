import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-unstable-store-subscribe.mts';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-store-subscribe-'));
const compiled = path.join(root, 'compiled');
mkdirSync(path.join(root, 'src/ui'), { recursive: true });
mkdirSync(path.join(compiled, 'src/ui'), { recursive: true });
writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }));
const runtime = path.join(root, 'runtime');
mkdirSync(path.join(runtime, 'src/ui'), { recursive: true });
writeFileSync(
  path.join(runtime, 'package.json'),
  JSON.stringify({ dependencies: { 'react-compiler-runtime': '1' } }),
);
writeFileSync(
  path.join(compiled, 'package.json'),
  JSON.stringify({ devDependencies: { 'babel-plugin-react-compiler': '1' } }),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const filename = path.join(root, 'src/ui/panel.tsx');
const tester = createReactRuleTester();

const hooks = `import { useCallback, useSyncExternalStore } from 'react';
import * as React from 'react';
import { useSyncExternalStore as useShim } from 'use-sync-external-store/shim';
import { useSyncExternalStore as useOther } from 'store-kit';
const subscribe = (notify) => store.subscribe(notify);
const getSnapshot = () => store.snapshot;
const getFresh = () => ({ todos: store.todos });
function getList() { return store.todos.map((todo) => todo.id); }`;

function inHook(body: string) {
  return `${hooks}\nexport function useTodos(store) {\n  ${body}\n}`;
}

function recreated(body: string, file = filename) {
  return {
    filename: file,
    code: inHook(body),
    errors: [{ messageId: 'recreatedSubscribe' as const }],
  };
}

function fresh(body: string, what: string) {
  return {
    filename,
    code: inHook(body),
    errors: [{ messageId: 'freshSnapshot' as const, data: { what } }],
  };
}

tester.run('react-no-unstable-store-subscribe', rule, {
  valid: [
    { filename, code: inHook('return useSyncExternalStore(subscribe, getSnapshot);') },
    {
      filename,
      code: inHook('return useSyncExternalStore(() => () => {}, () => true, () => false);'),
    },
    {
      filename,
      code: inHook('const noop = () => () => {}; return useSyncExternalStore(noop, () => true);'),
    },
    {
      filename,
      code: inHook('return useSyncExternalStore(subscribe, () => new Registry(store));'),
    },
    {
      filename,
      code: inHook('return useSyncExternalStore(subscribe, getSnapshot, () => store.initial);'),
    },
    {
      filename,
      code: inHook('return useSyncExternalStore(subscribe, () => store.snapshot, () => null);'),
    },
    {
      filename,
      code: inHook('return useSyncExternalStore(store.subscribe, () => store.todos.length);'),
    },
    {
      filename,
      code: inHook(
        'const listen = useCallback((notify) => store.subscribe(notify), [store]); return useSyncExternalStore(listen, getSnapshot);',
      ),
    },
    { filename, code: inHook('return useSyncExternalStore(subscribe, () => JSON.parse(read()));') },
    {
      filename,
      code: `${hooks}\nexport function createHost() { const listen = (notify) => store.subscribe(notify); return function useHosts() { return useSyncExternalStore(listen, getSnapshot); }; }`,
    },
    {
      filename,
      code: inHook('return useSyncExternalStore(subscribe, () => store.name.slice(0, 2));'),
    },
    { filename, code: inHook('return useOther((notify) => store.subscribe(notify), () => ({}));') },
    {
      filename: path.join(runtime, 'src/ui/panel.tsx'),
      code: inHook(
        'return useSyncExternalStore((notify) => store.subscribe(notify), getSnapshot);',
      ),
    },
    {
      filename: path.join(compiled, 'src/ui/panel.tsx'),
      code: inHook(
        'return useSyncExternalStore((notify) => store.subscribe(notify), getSnapshot);',
      ),
    },
  ],
  invalid: [
    recreated('return useSyncExternalStore((notify) => store.subscribe(notify), getSnapshot);'),
    recreated(
      'return React.useSyncExternalStore(function (notify) { return store.subscribe(notify); }, getSnapshot);',
    ),
    recreated(
      'const listen = (notify) => store.subscribe(notify); return useSyncExternalStore(listen, getSnapshot);',
    ),
    recreated(
      'function listen(notify) { return store.subscribe(notify); } return useShim(listen, getSnapshot);',
    ),
    fresh(
      'return useSyncExternalStore(subscribe, () => ({ todos: store.todos, count: store.todos.length }));',
      'a new object',
    ),
    fresh('return useSyncExternalStore(subscribe, getFresh);', 'a new object'),
    fresh('return useSyncExternalStore(subscribe, getList);', 'the new array from `.map(...)`'),
    fresh('return useSyncExternalStore(subscribe, getSnapshot, () => []);', 'a new array'),
    fresh(
      'return useSyncExternalStore(subscribe, () => new Map(store.entries));',
      'a new object from `new`',
    ),
    {
      filename: path.join(compiled, 'src/ui/panel.tsx'),
      code: inHook('return useSyncExternalStore(subscribe, () => [store.a]);'),
      errors: [{ messageId: 'freshSnapshot' as const, data: { what: 'a new array' } }],
    },
  ],
});
