import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-per-call-debounce.mts';

const tester = typescriptRuleTester();
const tsx = '/repo/src/ui/Form.tsx';
const ts = '/repo/src/content/observer.ts';
const LODASH = "import debounce from 'lodash/debounce';\n";
const bad = (filename: string, code: string) => ({
  filename,
  code,
  errors: [{ messageId: 'perCall' }],
});
const ok = (filename: string, code: string) => ({ filename, code });
const component = (body: string) =>
  `${LODASH}function ForgotPassword() { ${body} return <form onSubmit={submit} />; }`;

tester.run('no-per-call-debounce', rule, {
  valid: [
    ok(
      ts,
      `${LODASH}class A { private readonly run = debounce(() => this.process(), 100); onMutation() { idle(this.run); } }`,
    ),
    ok(
      ts,
      `${LODASH}class A { constructor() { this.run = debounce(() => this.process(), 100); } }`,
    ),
    ok(
      ts,
      `${LODASH}class A { init() { el.addEventListener('x', debounce(() => this.process(), 100)); } }`,
    ),
    ok(
      ts,
      `${LODASH}class A { ngOnInit() { this.sub = fromEvent(el, 'x').subscribe(debounce(() => 1, 100)); } }`,
    ),
    ok(ts, `${LODASH}const run = debounce(save, 100); export function onChange() { run(); }`),
    ok(ts, `${LODASH}export function createSaver() { return debounce(save, 100); }`),
    ok(ts, `${LODASH}export const createSaver = () => debounce(save, 100);`),
    ok(
      ts,
      "import { debounce } from 'rxjs'; class A { onChange() { this.x$.pipe(debounce(() => timer(1))); } }",
    ),
    ok(
      ts,
      'function debounce(f: () => void) { return f; } class A { init() { use(debounce(f)); } }',
    ),
    ok(ts, 'class A { onChange() { use(debounce(f, 100)); } }'),
    ok(ts, `${LODASH}class A { onChange() { this.x = debounce(f, 100); } }`),
    ok(tsx, component('const submit = useMemo(() => debounce(send, 250), []);')),
    ok(tsx, component('const submit = useCallback(debounce(send, 250), []);')),
    ok(tsx, component('const ref = useRef(debounce(send, 250)); const submit = ref.current;')),
    ok(
      tsx,
      component(
        'useEffect(() => { const d = debounce(send, 250); d(); return () => d.cancel(); }, []); const submit = 1;',
      ),
    ),
    ok(
      tsx,
      component(
        'const ref = useRef<any>(null); if (!ref.current) { ref.current = debounce(send, 250); } const submit = ref.current;',
      ),
    ),
    ok(tsx, `${LODASH}function useDebounced(fn: () => void) { return debounce(fn, 100); }`),
    ok(ts, `${LODASH}function make() { const d = debounce(save, 100); return d; }`),
    ok(ts, `${LODASH}function init() { const d = debounce(save, 100); d(); }`),
    ok(ts, `${LODASH}function watch() { const d = debounce(save, 100); el.on('x', () => d()); }`),
  ],
  invalid: [
    bad(
      ts,
      `${LODASH}class A { onMutation() { requestIdleCallback(debounce(this.processMutations, 100)); } }`,
    ),
    bad(
      ts,
      "import { throttle } from 'lodash-es'; class A { onScroll() { el.addEventListener('x', throttle(() => this.sync(), 50)); } }",
    ),
    bad(ts, "import _ from 'lodash'; class A { handle() { run(_.debounce(f, 10)); } }"),
    bad(
      ts,
      "import { debounce } from 'es-toolkit'; export function onInput(v: string) { debounce(send, 100)(v); }",
    ),
    bad(
      ts,
      "import debounce from 'lodash.debounce'; export function onInput(v: string) { debounce(send, 100)(v); }",
    ),
    bad(ts, `${LODASH}export function onInput(e: E) { const d = debounce(search, 200); d(e); }`),
    bad(ts, `${LODASH}class A { onInput(e: E) { const d = debounce(search, 200); d(e); } }`),
    bad(tsx, component('const submit = debounce(sendResetEmail, 250);')),
    bad(tsx, component('const submit = (e: E) => { debounce(sendResetEmail, 250)(e); };')),
    bad(tsx, component('const submit = (e: E) => { const d = debounce(send, 250); d(e); };')),
    bad(
      tsx,
      `import { throttle } from 'throttle-debounce'; export function useScroll() { const [y, setY] = useState(0); const onScroll = throttle(100, () => setY(1)); return onScroll; }`.replace(
        'return onScroll;',
        'document.addEventListener("scroll", onScroll); return y;',
      ),
    ),
  ],
});
