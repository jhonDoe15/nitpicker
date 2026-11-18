import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { inClass } from '../../../test-support/lifecycle-cases.mts';
import { rule } from './no-per-call-registration.mts';

const tester = typescriptRuleTester();
const bad = (body: string, messageId: string) => ({ ...inClass(body), errors: [{ messageId }] });
const STORE = 'private readonly store = new DisposableStore();';

tester.run('no-per-call-registration', rule, {
  valid: [
    inClass('constructor() { this._register(new Monitor()); }'),
    inClass('private readonly monitor = this._register(new Monitor());'),
    inClass('onPointerDown() { this.monitor = new Monitor(); }'),
    inClass('init() { this._register(new Monitor()); }'),
    inClass(
      `${STORE} onAdd() { const d = this.store.add(new Monitor()); run(() => this.store.delete(d)); }`,
    ),
    inClass('activate() { this._register(this.input.onDidFocus(() => {})); }'),
    inClass(
      'onPointerDown() { if (!this.monitor) { this.monitor = this._register(new Monitor()); } }',
    ),
    inClass(
      'onPointerDown() { this.monitor?.dispose(); this.monitor = this._register(new Monitor()); }',
    ),
    inClass(`${STORE} onChange() { this.store.clear(); this.store.add(new Monitor()); }`),
    inClass(
      'private readonly items = new Set<number>(); onChange() { this.items.add(new Monitor()); }',
    ),
    inClass('private readonly seen = new Set<string>(); onChange(x: string) { this.seen.add(x); }'),
    inClass('onChange() { this._register(this.value); }'),
    inClass('setup() { process.on("exit", () => this.kill()); }'),
    inClass('onTask() { const h = () => {}; process.on("exit", h); }'),
    inClass('onTask() { process.on("exit", () => {}); process.off("exit", this.h); }'),
    inClass('onTask() { process.once("exit", () => this.kill()); }'),
    inClass('onTask() { emitter.on("exit", () => this.kill()); }'),
    inClass('run() { this._register(new Monitor()); }'),
    inClass(
      'onAdd(x: X) { const d = this._register(x.onDisposed(() => { this._store.delete(d); })); }',
    ),
    inClass(
      `${STORE} onAdd(x: X) { const d = this.store.add(x.onDisposed(() => { this.store.delete(d); })); }`,
    ),
    inClass(
      'constructor(items: I[]) { for (const i of items) { this.addRow(i); } } addRow(i: I) { this._register(new Row(i)); }',
    ),
    inClass('private readonly rows = this.build(); build() { return this._register(new Rows()); }'),
    inClass(
      'onTask() { if (this.started) { return; } this.started = true; process.on("exit", () => this.kill()); }',
    ),
    inClass('setup() { run(() => this.track(1)); } track(i: I) { this._register(new Row(i)); }'),
    { filename: '/repo/src/a.ts', code: 'function onTask() { process.on("exit", () => {}); }' },
  ],
  invalid: [
    bad('onPointerDown() { this.monitor = this._register(new Monitor()); }', 'store'),
    bad(
      'onDidChange(e: E) { this._register(e.model.onDidChange(() => this.refresh())); }',
      'store',
    ),
    bad('handleOpen() { this._register(toDisposable(() => {})); }', 'store'),
    bad(`${STORE} onAdd(x: X) { this.store.add(x.onDispose(() => {})); }`, 'store'),
    bad(
      'show(items: I[]) { for (const item of items) { this._register(new Row(item)); } }',
      'store',
    ),
    bad('show(items: I[]) { items.forEach((i) => { this._register(new Row(i)); }); }', 'store'),
    bad('constructor() { a.on("x", this.add); } add() { this._register(new Row()); }', 'store'),
    bad('onTask = (e: E) => { this._register(new Row(e)); };', 'store'),
    bad(
      'constructor() { bus.onEvent(() => this.add()); } add() { this._register(new Row()); }',
      'store',
    ),
    bad('onTask() { process.on("exit", () => this.kill()); }', 'process'),
    bad('handleTask() { process.addListener("SIGINT", function () { stop(); }); }', 'process'),
    bad(
      'schedule(t: T[]) { for (const x of t) { this.track(x); } } track(x: T) { process.on("exit", () => x.kill()); }',
      'process',
    ),
  ],
});
