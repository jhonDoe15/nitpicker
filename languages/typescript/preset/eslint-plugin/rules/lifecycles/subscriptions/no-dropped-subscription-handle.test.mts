import { namedErrorProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule } from './no-dropped-subscription-handle.mts';

const { tester, typed } = namedErrorProject('nitpicker-dropped-handle-', 'dropped');

const PRELUDE = `interface IDisposable { dispose(): void }
interface Subscription { unsubscribe(): void }
declare class Emitter<T> { event: (listener: (e: T) => void) => IDisposable; }
declare const input: {
  onDidFocus(l: () => void): IDisposable;
  once(l: () => void): IDisposable;
  onDidBlur(l: () => void): () => void;
  fire(): void;
};
declare const maybeInput: typeof input | undefined;
declare const stream: {
  subscribe(l: () => void): Subscription;
  pipe(...o: unknown[]): { subscribe(l: () => void): Subscription };
};
declare const store: { add<T extends IDisposable>(x: T): T };
declare function take(n: number): unknown;
declare function watchFile(path: string): { close(): void };
declare function onceDone(l: () => void): IDisposable;
`;
const withPrelude = (code: string) => `${PRELUDE}${code}`;
const inClass = (body: string) => withPrelude(`class Widget { ${body} dispose() {} }`);
const ok = (code: string) => typed(code);
const bad = (code: string, name: string) => typed(code, name);

tester.run('no-dropped-subscription-handle', rule, {
  valid: [
    ok(
      inClass(
        'constructor(private readonly store: typeof store) { this.store.add(input.onDidFocus(() => {})); }',
      ),
    ),
    ok(
      inClass(
        'constructor() { const d = input.onDidFocus(() => {}); this.d = d; } d?: IDisposable;',
      ),
    ),
    ok(inClass('constructor() { this.d = input.onDidFocus(() => {}); } d?: IDisposable;')),
    ok(inClass('constructor() { input.once(() => {}); }')),
    ok(inClass('constructor() { onceDone(() => {}); }')),
    ok(inClass('constructor() { void input.onDidFocus(() => {}); }')),
    ok(inClass('constructor() { input.fire(); }')),
    ok(inClass('constructor() { stream.pipe(take(1)).subscribe(() => {}); }')),
    ok(inClass('constructor() { watchFile("a"); }')),
    ok(withPrelude('class Widget { constructor() { input.onDidFocus(() => {}); } }')),
    ok(withPrelude('function run() { input.onDidFocus(() => {}); }')),
    ok(
      withPrelude(
        'class Widget { private readonly e = new Emitter<number>(); constructor() { this.e.event(() => {}); } dispose() {} }',
      ),
    ),
    ok(
      withPrelude(
        'class Source { onDidFocus(l: () => void): IDisposable { return { dispose() {} }; } } class Widget { private readonly own = new Source(); constructor() { this.own.onDidFocus(() => {}); } dispose() {} }',
      ),
    ),
    ok(inClass('constructor(x: any) { x.onDidFocus(() => {}); }')),
    ok(
      inClass(
        'constructor() { const store2 = { add(x: IDisposable) { return x; } }; store2.add(input.onDidFocus(() => {})); }',
      ),
    ),
  ],
  invalid: [
    bad(inClass('start() { maybeInput?.onDidBlur(() => {}); }'), 'maybeInput?.onDidBlur'),
    bad(inClass('constructor() { input.onDidFocus(() => {}); }'), 'input.onDidFocus'),
    bad(inClass('start() { input.onDidBlur(() => {}); }'), 'input.onDidBlur'),
    bad(inClass('constructor() { stream.subscribe(() => {}); }'), 'stream.subscribe'),
    bad(
      inClass('constructor(private readonly src: typeof input) { this.src.onDidFocus(() => {}); }'),
      'this.src.onDidFocus',
    ),
    bad(withPrelude('input.onDidFocus(() => {});'), 'input.onDidFocus'),
    bad(
      withPrelude('class Widget { close() {} constructor() { input.onDidFocus(() => {}); } }'),
      'input.onDidFocus',
    ),
    bad(
      withPrelude('class Widget { ngOnDestroy() {} init() { stream.subscribe(() => {}); } }'),
      'stream.subscribe',
    ),
  ],
});
