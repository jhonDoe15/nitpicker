import path from 'node:path';
import { useTemporaryProjects } from '../../../../test-support/temporary-projects.mts';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-hydration-mismatch.mts';

const projects = useTemporaryProjects('nitpicker-hydration-', { keepForFile: true });
const root = projects.projectWith({
  'site/package.json': '{"name":"site","dependencies":{"next":"15.0.0","react":"19.0.0"}}',
  'spa/package.json': '{"name":"spa","dependencies":{"react":"19.0.0","vite":"6.0.0"}}',
  'site/app/use-is-client.ts':
    "export function useIsClient() { return typeof window !== 'undefined'; }",
  'site/app/use-mounted.ts': [
    "import { useEffect, useState } from 'react';",
    'export const useMounted = () => { const [on, setOn] = useState(false);',
    'useEffect(() => setOn(true), []); return on; };',
  ].join('\n'),
  'site/app/hooks.ts': "export { useIsClient as useClient } from './use-is-client';",
  'site/app/page.tsx': [
    "import dynamic from 'next/dynamic';",
    "const Chart = dynamic(() => import('./chart'), { ssr: false });",
    "const Table = dynamic(() => import('./table').then((loaded) => loaded.Table));",
  ].join('\n'),
  'site/app/chart.tsx': 'export default function Chart() { return null; }',
  'site/app/table.tsx': 'export function Table() { return null; }',
  'ssr/package.json': '{"name":"ssr","dependencies":{"react":"19.0.0","react-dom":"19.0.0"}}',
  'ssr/src/client.tsx':
    "import { hydrateRoot } from 'react-dom/client'; hydrateRoot(document, <App />);",
  'csr/package.json': '{"name":"csr","dependencies":{"react":"19.0.0","react-dom":"19.0.0"}}',
  'csr/src/client.test.tsx': "// import { hydrateRoot } from 'react-dom/client' in a test",
  'csr/src/client.tsx':
    "import { createRoot } from 'react-dom/client'; createRoot(root).render(<App />);",
});

const site = path.join(root, 'site/app/sidebar.tsx');
const spa = path.join(root, 'spa/src/sidebar.tsx');
const chart = path.join(root, 'site/app/chart.tsx');
const table = path.join(root, 'site/app/table.tsx');
const hydrated = path.join(root, 'ssr/src/sidebar.tsx');
const clientRendered = path.join(root, 'csr/src/sidebar.tsx');
const IS_CLIENT = "import { useIsClient } from './use-is-client';";
const LAZY_WIDE =
  "const [wide] = useState(() => typeof window !== 'undefined' && window.innerWidth > 600);";
const FLAG = "const isBrowser = typeof window !== 'undefined';";

function component(body: string, head = '') {
  return `${head}\nexport function Sidebar({ items, data }) { ${body} }`;
}

function ok(body: string, head = '', filename = site) {
  return { filename, code: component(body, head) };
}

function bad(body: string, head = '', filename = site) {
  return {
    filename,
    code: component(body, head),
    errors: [{ messageId: 'mismatch' as const }],
  };
}

function badStart(body: string, name: string) {
  return {
    filename: site,
    code: component(body),
    errors: [{ messageId: 'initial' as const, data: { name } }],
  };
}

const tester = createReactRuleTester();

tester.run('react-no-hydration-mismatch', rule, {
  valid: [
    ok("return <div>{typeof window !== 'undefined' && <Wide />}</div>;", '', spa),
    ok(
      "return <div>{typeof window !== 'undefined' && createPortal(<Menu />, document.body)}</div>;",
    ),
    ok(
      "return <div>{typeof document !== 'undefined' ? ReactDOM.createPortal(<Menu />, document.body) : null}</div>;",
    ),
    ok(
      "return <Select menuPortalTarget={typeof document !== 'undefined' ? document.body : null} />;",
    ),
    ok(
      "return <time suppressHydrationWarning>{typeof window !== 'undefined' ? new Date().toString() : ''}</time>;",
    ),
    ok(
      "useEffect(() => { if (typeof window !== 'undefined') { setWide(true); } }, []); return <Narrow />;",
    ),
    ok(
      "const onClick = () => (typeof window !== 'undefined' ? open() : null); return <button onClick={onClick} />;",
    ),
    ok(
      "return <ul>{items.map((item) => (typeof window !== 'undefined' ? <Wide key={item} /> : null))}</ul>;",
    ),
    ok("return <div>{data && <p>{typeof navigator !== 'undefined' ? 'a' : 'b'}</p>}</div>;"),
    ok('return <div>{data ? <Wide /> : <Narrow />}</div>;'),
    ok("return <div>{typeof window !== 'undefined' ? null : undefined}</div>;"),
    ok('return <div>{props.isBrowser && <Wide />}</div>;', FLAG),
    ok(
      'return isMobile ? <Wide /> : <Narrow />;',
      "const isMobile = typeof window !== 'undefined' && window.innerWidth < 600;",
    ),
    ok("const window = useFrame(); return <div>{typeof window !== 'undefined' && <Wide />}</div>;"),
    {
      filename: site,
      code: "function render() { return typeof window !== 'undefined' ? <Wide /> : <Narrow />; }",
    },
    ok(`${LAZY_WIDE} return <div onClick={() => wide && open()} />;`),
    ok(`${LAZY_WIDE} useEffect(() => { if (wide) open(); }, [wide]); return <Narrow />;`),
    ok(`${LAZY_WIDE} return <div>{wide ? <Wide /> : <Narrow />}</div>;`, '', spa),
    ok(`${LAZY_WIDE} return <div suppressHydrationWarning>{wide ? 'a' : 'b'}</div>;`),
    ok("const [open] = useState(false); return <div>{open ? 'a' : 'b'}</div>;"),
    ok(`${LAZY_WIDE} return <Grid wide={wide} />;`),
    ok(
      "const [n] = useState(() => { if (typeof window !== 'undefined') track(); return 0; }); return <div>{n}</div>;",
    ),
    ok(
      'const useIsClient = () => mounted; return <div>{useIsClient() && <Wide />}</div>;',
      IS_CLIENT.replace('useIsClient', 'useIsClient as unused'),
    ),
    ok(`${LAZY_WIDE} return <input key={String(wide)} onChange={() => wide} />;`),
    ok('const size = useMemo(() => compute(items), [items]); return <div>{size}</div>;'),
    ok("const size = useMemo(typeof window !== 'undefined', []); return <div>{size}</div>;"),
    ok(
      'const mounted = useMounted(); return <div>{mounted && <Wide />}</div>;',
      "import { useMounted } from './use-mounted';",
    ),
    ok("return <div>{typeof window !== 'undefined' && <Wide />}</div>;", '', chart),
    ok("return <div>{typeof window !== 'undefined' && <Wide />}</div>;", '', clientRendered),
    ok("return <div>{'window' in props ? <Wide /> : <Narrow />}</div>;"),
  ],
  invalid: [
    bad("return <div>{typeof window !== 'undefined' && <Wide />}</div>;"),
    bad('return isBrowser ? <Wide /> : <Narrow />;', FLAG),
    bad(
      'return isClient ? <Wide /> : <Narrow />;',
      "const isClient = typeof window !== 'undefined' && typeof document !== 'undefined';",
    ),
    bad("return <>{typeof localStorage === 'undefined' ? null : <Saved />}</>;"),
    bad(
      "return <main>{typeof window !== 'undefined' && !data && <style>{'.dark {}'}</style>}{items}</main>;",
    ),
    {
      filename: site,
      code: "export const Badge = () => (typeof window !== 'undefined' ? <Wide /> : <Narrow />);",
      errors: [{ messageId: 'mismatch' as const }],
    },
    badStart(`${LAZY_WIDE} return <div>{wide ? <Wide /> : <Narrow />}</div>;`, 'wide'),
    badStart(
      "const [theme] = useState(typeof window === 'undefined' ? 'light' : 'dark'); return <main className={theme} />;",
      'theme',
    ),
    badStart(
      "const [saved] = useState(() => { if (typeof window === 'undefined') return ''; return localStorage.x; }); return <p>{saved}</p>;",
      'saved',
    ),
    badStart(
      "const label = useMemo(() => { if (typeof navigator === 'undefined') return ''; return navigator.language; }, []); return <p>{label}</p>;",
      'label',
    ),
    bad('const isClient = useIsClient(); return <div>{isClient && <Wide />}</div>;', IS_CLIENT),
    bad(
      'return <div>{useClient() ? <Wide /> : <Narrow />}</div>;',
      "import { useClient } from './hooks';",
    ),
    bad("return <div>{typeof window !== 'undefined' && <Wide />}</div>;", '', table),
    bad("return <div>{typeof window !== 'undefined' && <Wide />}</div>;", '', hydrated),
    bad("return <div>{'window' in globalThis ? <Wide /> : <Narrow />}</div>;"),
    bad("return <div>{typeof globalThis.document === 'undefined' ? null : <Wide />}</div>;"),
  ],
});
