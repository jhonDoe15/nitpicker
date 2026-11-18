import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-uncleared-timeout.mts';

const tester = typescriptRuleTester();
const tsx = { filename: '/repo/src/ui/Copy.tsx' };
const ts = { filename: '/repo/src/auth/login.ts' };
const bad = (file: { filename: string }, code: string, messageId: string) => ({
  ...file,
  code,
  errors: [{ messageId }],
});
const ok = (file: { filename: string }, code: string) => ({ ...file, code });

const OAUTH = `function waitForCode(server: Server) {
  return new Promise<string>((resolve, reject) => {
    TIMER
    server.on('request', (req) => { resolve(req.code); });
  });
}`;
const timer = (line: string) => OAUTH.replace('TIMER', line);

const COPY = `function CopyButton() {
  const [copied, setCopied] = useState(false);
  BODY
  return <button onClick={onCopy}>copy</button>;
}`;
const copy = (body: string) => COPY.replace('BODY', body);

tester.run('no-uncleared-timeout', rule, {
  valid: [
    ok(
      ts,
      timer(
        "const t = setTimeout(() => reject(new Error('timeout')), 5000); server.on('close', () => clearTimeout(t));",
      ),
    ),
    ok(ts, timer("setTimeout(() => reject(new Error('timeout')), 5000).unref();")),
    ok(
      ts,
      'function sleep(ms: number) { return new Promise((resolve) => { setTimeout(resolve, ms); }); }',
    ),
    ok(
      ts,
      'function wait() { return new Promise((resolve) => { setTimeout(() => resolve(1), 10); }); }',
    ),
    ok(ts, timer('setTimeout(() => { log(1); }, 5000);')),
    ok(
      tsx,
      copy(
        'const mounted = useRef(true); const onCopy = () => { ' +
          'setTimeout(() => { if (mounted.current) { setCopied(false); } }, 2000); };',
      ),
    ),
    ok(
      ts,
      'class A { dispose() {} onTick() { setTimeout(() => { if (!this._disposed) { this.tick(); } }, 1); } }',
    ),
    ok(ts, 'function start() { setTimeout(() => { log(1); }, 5000); }'),
    ok(
      tsx,
      copy(
        'const onCopy = () => { setCopied(true); const id = setTimeout(() => setCopied(false), 2000); ref.current = id; };',
      ),
    ),
    ok(tsx, copy('useEffect(() => { setTimeout(() => setCopied(false), 2000); }, []);')),
    ok(tsx, copy('const onCopy = () => { setTimeout(() => log(1), 2000); };')),
    ok(
      tsx,
      copy(
        'const onCopy = () => { clearTimeout(ref.current); setTimeout(() => setCopied(false), 2000); };',
      ),
    ),
    ok(
      tsx,
      'function format() { const [a, setA] = [1, () => {}]; const f = () => { setTimeout(() => setA(1), 1); }; return f; }',
    ),
    ok(ts, 'class A { dispose() {} start() { setTimeout(() => this.tick(), 1); } }'),
    ok(ts, 'class A { onTick() { setTimeout(() => this.tick(), 1); } }'),
    ok(
      ts,
      'class A { dispose() { clearTimeout(this.t); } onTick() { setTimeout(() => this.tick(), 1); } }',
    ),
    ok(ts, 'class A { dispose() {} onTick() { setTimeout(() => { log(1); }, 1); } }'),
    ok(ts, 'class A { dispose() {} onTick() { this.t = setTimeout(() => this.tick(), 1); } }'),
  ],
  invalid: [
    bad(
      ts,
      timer(
        "setTimeout(() => { server.close(); reject(new Error('OAuth callback timeout')); }, 300000);",
      ),
      'promise',
    ),
    bad(ts, timer("setTimeout(() => reject(new Error('timeout')), 5000);"), 'promise'),
    bad(ts, timer('globalThis.setTimeout(() => server.destroy(), 5000);'), 'promise'),
    bad(
      tsx,
      `export default function handleRequest() {
  return new Promise((resolve, reject) => {
    setTimeout(() => abort(), 6000);
    const { pipe, abort } = render({
      onShellReady() { resolve(new Response()); },
      onShellError(e: unknown) { reject(e); },
    });
  });
}`,
      'promise',
    ),
    bad(
      tsx,
      copy(
        'const onCopy = () => { copy(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };',
      ),
      'component',
    ),
    bad(
      tsx,
      'function useBanner() { const [banner, setBanner] = useState(1); const remove = useCallback(() => { setTimeout(() => { setBanner(0); }, 100); }, []); return remove; }',
      'component',
    ),
    bad(
      ts,
      'class A { dispose() {} onTick = () => { setTimeout(() => this.tick(), 1); }; }',
      'owner',
    ),
    bad(ts, 'class A { dispose() {} onTick() { setTimeout(() => this.tick(), 1); } }', 'owner'),
    bad(
      ts,
      'class A { disconnectedCallback() {} handleClick() { setTimeout(() => this.render(), 1); } }',
      'owner',
    ),
    bad(
      ts,
      'class A { ngOnDestroy() {} run(xs: X[]) { for (const x of xs) { setTimeout(() => this.use(x), 1); } } }',
      'owner',
    ),
  ],
});
