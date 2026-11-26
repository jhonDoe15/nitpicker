import { typedTsProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from './react-no-dropped-effect-handle.mts';

const { tester, write } = typedTsProject('nitpicker-effect-handle-');

const PRELUDE = `interface IDisposable { dispose(): void }
interface Subscription { unsubscribe(): void }
declare const store: { subscribe(l: () => void): () => void; getState(): number };
declare const events: { on(name: string, l: () => void): typeof events; onChange(l: () => void): IDisposable };
declare const stream: { subscribe(l: () => void): Subscription; pipe(...o: unknown[]): { subscribe(l: () => void): Subscription } };
declare const history: { listen(l: () => void): () => void; setTitle(t: string): () => void };
declare function registerFlush(key: string, f: () => void): () => void;
declare const ref: { current: unknown };
declare function take(n: number): unknown;
declare function keep(handle: unknown): void;
`;

function effect(body: string, arrow = true) {
  const callback = arrow ? `() => { ${body} }` : `function () { ${body} }`;
  return `${PRELUDE}function Panel() { useEffect(${callback}, []); return null; }`;
}

function ok(body: string) {
  const code = effect(body);
  return { filename: write(code, 'ts'), code };
}

function bad(body: string, messageId: 'dropped' | 'unused', name: string, handle = '') {
  const code = effect(body);
  return { filename: write(code, 'ts'), code, errors: [{ messageId, data: { name, handle } }] };
}

tester.run('react-no-dropped-effect-handle', rule, {
  valid: [
    ok('return store.subscribe(() => {});'),
    ok('const off = store.subscribe(() => {}); return () => off();'),
    ok('const off = store.subscribe(() => {}); return off;'),
    ok('const sub = stream.subscribe(() => {}); return () => sub.unsubscribe();'),
    ok('ref.current = store.subscribe(() => {});'),
    ok('keep(store.subscribe(() => {}));'),
    ok('events.on("x", () => {});'),
    ok('stream.pipe(take(1)).subscribe(() => {});'),
    ok('history.setTitle("x");'),
    ok('store.getState();'),
    ok('registerFlush("items", () => {});'),
    ok('store.subscribe(() => {}); return () => store.getState();'),
    ok('const local = { subscribe: store.subscribe }; local.subscribe(() => {});'),
    ok('if (!store) { return; } store.getState();'),
    ok('const run = () => { store.subscribe(() => {}); }; return run;'),
    {
      filename: write(`${PRELUDE}function run() { store.subscribe(() => {}); }`, 'ts'),
      code: `${PRELUDE}function run() { store.subscribe(() => {}); }`,
    },
  ],
  invalid: [
    bad('store.subscribe(() => {});', 'dropped', 'store.subscribe'),
    bad('events.onChange(() => {});', 'dropped', 'events.onChange'),
    bad('stream.subscribe(() => {});', 'dropped', 'stream.subscribe'),
    bad('if (store) { history.listen(() => {}); }', 'dropped', 'history.listen'),
    bad('if (!store) { return; } store.subscribe(() => {});', 'dropped', 'store.subscribe'),
    bad('const off = store.subscribe(() => {});', 'unused', 'store.subscribe', 'off'),
  ],
});
