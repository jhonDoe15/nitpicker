import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { typedTsProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from './react-no-dropped-effect-handle.mts';

const REACT_TYPES = `declare module 'react' {
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
}
`;

const { root, tester, write } = typedTsProject('nitpicker-react-effect-handle-', {
  prepare(projectRoot) {
    writeFileSync(path.join(projectRoot, 'src/react.d.ts'), REACT_TYPES);
  },
});

const PRELUDE = `import { useEffect, useLayoutEffect } from 'react';
declare function useOther(effect: () => void | (() => void), deps?: readonly unknown[]): void;
interface IDisposable { dispose(): void }
interface Subscription { unsubscribe(): void; readonly closed: boolean }
interface Closer { close(): void }
interface Disconnector { disconnect(): void }
declare const store: {
  subscribe(listener: () => void): () => void;
  onChange(listener: () => void): () => void;
  on(event: string, listener: () => void): () => void;
  once(listener: () => void): () => void;
  addListener(listener: () => void): IDisposable;
  addEventListener(event: string, listener: () => void): void;
  setTheme(theme: string): () => void;
  getCount(): number;
};
declare const maybeStore: typeof store | undefined;
declare const stream: {
  subscribe(listener: () => void): Subscription;
  pipe(...ops: unknown[]): { subscribe(listener: () => void): Subscription };
};
declare const httpClient: {
  get(url: string): { subscribe(listener: () => void): Subscription };
};
declare function take(n: number): unknown;
declare function first(): unknown;
declare function takeUntil(stop: unknown): unknown;
declare function onceReady(listener: () => void): IDisposable;
declare function acquireLock(): IDisposable;
declare function openChannel(): Closer;
declare function attachObserver(): Disconnector;
declare function registerCleanup(handle: unknown): void;
declare const onChange: () => void;
declare const destroy$: unknown;
declare const handleRef: { current: (() => void) | IDisposable | Subscription | undefined };
`;

const inComponent = (body: string) => `${PRELUDE}export function Panel() {\n${body}\n}`;
const ok = (body: string) => {
  const code = inComponent(body);
  return { filename: write(code, 'ts'), code };
};
const bad = (body: string, name: string) => {
  const code = inComponent(body);
  return {
    filename: write(code, 'ts'),
    code,
    errors: [{ messageId: 'dropped' as const, data: { name } }],
  };
};
const inTestFile = (body: string) => {
  const code = inComponent(body);
  const file = path.join(root, 'src/panel.test.ts');
  writeFileSync(file, code);
  return { filename: file, code };
};

tester.run('react-no-dropped-effect-handle', rule, {
  valid: [
    ok('useEffect(() => store.subscribe(onChange), []);'),
    ok('useEffect(() => { return store.subscribe(onChange); }, []);'),
    ok('useEffect(() => { const unsub = store.subscribe(onChange); return unsub; }, []);'),
    ok('useEffect(() => { const unsub = store.subscribe(onChange); return () => unsub(); }, []);'),
    ok(
      'useEffect(() => { const unsub = store.subscribe(onChange); return () => { unsub?.(); }; }, []);',
    ),
    ok(
      'useEffect(() => { const sub = stream.subscribe(onChange); return () => { sub.unsubscribe(); }; }, []);',
    ),
    ok('useEffect(() => { const lock = acquireLock(); return () => { lock.dispose(); }; }, []);'),
    ok('useEffect(() => { const ch = openChannel(); return () => { ch.close(); }; }, []);'),
    ok(
      'useEffect(() => { const obs = attachObserver(); return () => { obs.disconnect(); }; }, []);',
    ),
    ok('useEffect(() => { handleRef.current = store.subscribe(onChange); }, []);'),
    ok(
      'useEffect(() => { const unsub = store.subscribe(onChange); handleRef.current = unsub; }, []);',
    ),
    ok('useEffect(() => { registerCleanup(store.subscribe(onChange)); }, []);'),
    ok(
      'useEffect(() => { const unsub = store.subscribe(onChange); registerCleanup(unsub); }, []);',
    ),
    ok('useEffect(() => { store.once(onChange); }, []);'),
    ok('useEffect(() => { onceReady(onChange); }, []);'),
    ok('useEffect(() => { stream.pipe(take(1)).subscribe(onChange); }, []);'),
    ok('useEffect(() => { stream.pipe(first()).subscribe(onChange); }, []);'),
    ok('useEffect(() => { stream.pipe(takeUntil(destroy$)).subscribe(onChange); }, []);'),
    ok('useEffect(() => { httpClient.get("/items").subscribe(onChange); }, []);'),
    ok('useEffect(() => { store.setTheme("dark"); }, []);'),
    ok('useEffect(() => { store.getCount(); }, []);'),
    ok('useEffect(() => { store.addEventListener("click", onChange); }, []);'),
    ok('useEffect(() => { void store.subscribe(onChange); }, []);'),
    ok('useOther(() => { store.subscribe(onChange); }, []);'),
    ok('useEffect(() => { const run = () => { store.subscribe(onChange); }; run(); }, []);'),
    inTestFile('useEffect(() => { store.subscribe(onChange); }, []);'),
  ],
  invalid: [
    bad('useEffect(() => { store.subscribe(onChange); }, []);', 'store.subscribe'),
    bad('useLayoutEffect(() => { store.subscribe(onChange); }, []);', 'store.subscribe'),
    bad('useEffect(() => { maybeStore?.subscribe(onChange); }, []);', 'maybeStore?.subscribe'),
    bad('useEffect(() => { store.onChange(onChange); }, []);', 'store.onChange'),
    bad('useEffect(() => { store.on("tick", onChange); }, []);', 'store.on'),
    bad('useEffect(() => { store.addListener(onChange); }, []);', 'store.addListener'),
    bad('useEffect(() => { stream.subscribe(onChange); }, []);', 'stream.subscribe'),
    bad('useEffect(() => { acquireLock(); }, []);', 'acquireLock'),
    bad('useEffect(() => { openChannel(); }, []);', 'openChannel'),
    bad('useEffect(() => { attachObserver(); }, []);', 'attachObserver'),
    bad('useEffect(() => { const unsub = store.subscribe(onChange); }, []);', 'store.subscribe'),
    bad(
      'useEffect(() => { const sub = stream.subscribe(onChange); const closed = sub.closed; void closed; }, []);',
      'stream.subscribe',
    ),
    bad('useEffect(() => { const lock = acquireLock(); return () => {}; }, []);', 'acquireLock'),
  ],
});
