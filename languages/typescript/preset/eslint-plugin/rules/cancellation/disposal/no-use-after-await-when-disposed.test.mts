import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-use-after-await-when-disposed.mts';

const tester = typescriptRuleTester();

const TEARDOWN = 'dispose() { this._isDisposed = true; }';
const inClass = (method: string, teardown = TEARDOWN) => `class Terminal { ${teardown} ${method} }`;
const AFTER_AWAIT = [{ messageId: 'afterAwait' }];

tester.run('no-use-after-await-when-disposed', rule, {
  valid: [
    inClass('async start() { await this.resolve(); await setTimeout(10); }'),
    inClass('async start() { await this.resolve(); this._register(new Watcher()); }'),

    inClass(
      'async start() { const env = await this.resolve(); if (this._isDisposed) { return; } this.process = spawn(env); this._onDidStart.fire(); }',
    ),
    inClass(
      'async start() { await this.resolve(); if (!this._isDisposed) { this._onDidStart.fire(); } }',
    ),
    inClass(
      'async start() { await this.resolve(); if (token.isCancellationRequested) { return; } this._onDidStart.fire(); }',
    ),
    inClass('async start() { this._onDidStart.fire(); await this.resolve(); }'),
    inClass('async start() { await this.resolve(); this.value = 1; }'),
    inClass('async start() { await this.resolve(); other.fire(); }'),
    inClass('start() { this.resolve().then(() => 1); this._onDidStart.fire(); }'),
    inClass(
      'async start() { if (ready) { await this.resolve(); return; } this._onDidStart.fire(); }',
    ),
    inClass(
      'async start() { await this.resolve(); this.load(async () => { this._onDidStart.fire(); }); }',
    ),
    inClass(
      'constructor() { this.init(); } async init() { await this.resolve(); this._onDidStart.fire(); }',
    ),
    inClass(
      'async start() { await this.resolve(); this._onDidStart.fire(); }',
      'dispose() { this.items = []; }',
    ),
    inClass(
      'async start() { await this.resolve(); this._onDidStart.fire(); }',
      'reset() { this._isDisposed = true; }',
    ),
    'class A { async start() { await this.resolve(); this._onDidStart.fire(); } }',
    inClass(
      'async start() { try { await this.resolve(); } catch { return; } if (this._isDisposed) return; this._onX.fire(); }',
    ),
    inClass('async dispose2() { await this.resolve(); }'),
  ],
  invalid: [
    {
      code: inClass(
        'async start() { const env = await this.resolveEnvironment(); this.process = spawn(env); this._onDidStart.fire(); }',
      ),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass('async start() { await this.resolve(); this._onDidStart.fire(); }'),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass('async start() { await this.resolve(); this.emitter.emit("start"); }'),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass('async start() { await this.resolve(); setTimeout(() => this.tick(), 10); }'),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass(
        'async start() { const env = await this.resolve(); this.model = this.modelService.createModel(env); }',
      ),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass('async start() { await this.resolve(); this.child = cp.spawn("tool"); }'),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass(
        'async start() { await this.resolve(); window.setTimeout(() => this.tick(), 1); }',
      ),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass(
        'async start() { try { await this.resolve(); } catch (e) { log(e); } this._onDidStart.fire(); }',
      ),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass('start = async () => { await this.resolve(); this._onDidStart.fire(); };'),
      errors: AFTER_AWAIT,
    },
    {
      code: 'class Panel { close() { this.closed = true; } async open() { await load(); this.ready.fire(); } }',
      errors: AFTER_AWAIT,
    },
    {
      code: inClass(
        'async start() { await this.a(); if (this._isDisposed) return; await this.b(); this._onDidStart.fire(); }',
      ),
      errors: AFTER_AWAIT,
    },
    {
      code: inClass(
        'async start() { await this.resolve(); this._onDidStart.fire(); }',
        'destroy() { this.destroyed = true; }',
      ),
      errors: AFTER_AWAIT,
    },
  ],
});
