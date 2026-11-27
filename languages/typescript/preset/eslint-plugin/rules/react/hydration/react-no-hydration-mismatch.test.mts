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
  'site/app/hook-forms.ts': [
    "import { count } from 'counter-lib';",
    "export const useBoth = () => typeof window !== 'undefined' && typeof document !== 'undefined';",
    "export const useNegated = () => !(typeof window === 'undefined');",
    "export const useReversed = () => 'undefined' !== typeof window;",
    "export function useParenthesised() { return (typeof window !== 'undefined'); }",
    'export const useEither = function () {',
    '  const helper = () => { return 1; };',
    '  class Holder { read() { return 2; } }',
    "  if (helper()) { return typeof window !== 'undefined'; }",
    "  return typeof document !== 'undefined' || typeof navigator !== 'undefined';",
    '};',
    "export function useHidden() { return typeof window !== 'undefined'; }",
    'export const useCount = () => count + 1;',
    'export const useLiteral = () => 5;',
    'export const useNegative = () => -count;',
    'export const useCompare = () => count === 1;',
    "export const useForeign = () => typeof other !== 'undefined';",
    "export const useMember = () => typeof window.x !== 'undefined';",
    'export const useBare = () => { return; };',
    'export function useNothing() {}',
    'export declare function useDeclared(): boolean;',
    'export const useNumber = 5;',
    'export let useLater;',
    'export const { useDestructured } = source;',
  ].join('\n'),
  'site/app/hook-renamed.ts': [
    "import { useIsClient as useViaImport } from './use-is-client';",
    'export { useViaImport as useRenamed };',
  ].join('\n'),
  'site/app/hook-huge.ts': [
    "export const useHuge = () => typeof window !== 'undefined';",
    `export const padding = '${'x'.repeat(1_000_000)}';`,
  ].join('\n'),
  'site/app/hook-loop-a.ts': "export { useLoop } from './hook-loop-b';",
  'site/app/hook-loop-b.ts': "export { useLoop } from './hook-loop-a';",
  'site/app/lazy.tsx': [
    "import dynamic from 'next/dynamic';",
    "const load = () => import('./chart');",
    'dynamic();',
    'dynamic(load, { ssr: false });',
    "dynamic(() => import('./chart'), options);",
    "dynamic(() => import('./chart'), { ssr: true });",
    "dynamic(() => import('./chart'), { 'ssr': false });",
    "dynamic(() => import('./chart'), { loading: false });",
    "dynamic(() => import('./chart'), { ...extra });",
    'dynamic(() => import(name), { ssr: false });',
    "dynamic(() => import('./missing'), { ssr: false });",
    "dynamic(() => import('react'), { ssr: false });",
  ].join('\n'),
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

const hookCall = (name: string) => `const on = ${name}(); return <div>{on && <Wide />}</div>;`;
const importForm = (name: string) => `import { ${name} } from './hook-forms';`;
const BROWSER_HOOKS = [
  'useBoth',
  'useNegated',
  'useReversed',
  'useParenthesised',
  'useEither',
  'useHidden',
];
const OTHER_HOOKS = [
  'useCount',
  'useLiteral',
  'useNegative',
  'useCompare',
  'useForeign',
  'useMember',
  'useBare',
  'useNothing',
  'useDeclared',
  'useNumber',
  'useLater',
  'useDestructured',
  'useMissing',
];

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
    ...OTHER_HOOKS.map((name) => ok(hookCall(name), importForm(name))),
    ok(hookCall('useRemote'), "import { useRemote } from 'remote-lib';"),
    ok(hookCall('useHuge'), "import { useHuge } from './hook-huge';"),
    ok(hookCall('useLoop'), "import { useLoop } from './hook-loop-a';"),
    ok('return <div>{api.useIsClient() && <Wide />}</div>;', IS_CLIENT),
    ok('return <div>{useIsClient(1) && <Wide />}</div>;', IS_CLIENT),
    ok(
      'return <div>{check() && <Wide />}</div>;',
      IS_CLIENT.replace('useIsClient', 'useIsClient as check'),
    ),
    ok('return <div>{useGlobalFlag() && <Wide />}</div>;'),
    ok('return <div>{data || <Narrow />}</div>;'),
    ok("return <div>{'foo' in globalThis ? <Wide /> : <Narrow />}</div>;"),
    ok('return <div>{1 in globalThis ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{key in globalThis ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{items + data ? <Wide /> : <Narrow />}</div>;'),
    ok("return <div>{typeof window < 'x' ? <Wide /> : <Narrow />}</div>;"),
    ok('return <div>{typeof globalThis[key] === "undefined" ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{typeof globalThis.foo === "undefined" ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{typeof other.document === "undefined" ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{typeof load() === "undefined" ? <Wide /> : <Narrow />}</div>;'),
    ok('return <div>{({ isBrowser: 1 }).x ? <Wide /> : <Narrow />}</div>;', FLAG),
    ok('return <div>{isBrowser ? <Wide /> : <Narrow />}</div>;'),
    ok(
      'return <div>{isBrowser ? <Wide /> : <Narrow />}</div>;',
      'let isBrowser = typeof window !== "undefined";',
    ),
    ok('for (const item of items) { return item ? <Wide /> : <Narrow />; }'),
    ok('return <div>{flag ? <Wide /> : <Narrow />}</div>;', 'const flag = -1;'),
    ok(
      'return <div>{flag ? <Wide /> : <Narrow />}</div>;',
      "const flag = typeof window !== 'undefined' || count;",
    ),
    ok('const state = useState(() => typeof window !== "undefined"); return <p>{state}</p>;'),
    ok('const [state] = useMemo(() => typeof window !== "undefined", []); return <p>{state}</p>;'),
    ok('const [{ wide }] = useState(() => typeof window !== "undefined"); return <p>{wide}</p>;'),
    ok('const [, setWide] = useState(typeof window !== "undefined"); return <p>{setWide}</p>;'),
    ok('useState(typeof window !== "undefined"); return <div />;'),
    ok('const [n] = useState(() => { return; }); return <div>{n}</div>;'),
    ok('const x = fns[0](); return <div>{x}</div>;'),
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
    ...BROWSER_HOOKS.map((name) => bad(hookCall(name), importForm(name))),
    bad(hookCall('useRenamed'), "import { useRenamed } from './hook-renamed';"),
    bad(
      'return isServer ? <Wide /> : <Narrow />;',
      "const isServer = !(typeof window !== 'undefined');",
    ),
    bad('return <div>{({ [isBrowser]: 1 }).x ? <Wide /> : <Narrow />}</div>;', FLAG),
    bad('return <div>{({ a: isBrowser }).a ? <Wide /> : <Narrow />}</div>;', FLAG),
    bad('return <div>{props[isBrowser] ? <Wide /> : <Narrow />}</div>;', FLAG),
    bad('return <div>{isBrowser.x ? <Wide /> : <Narrow />}</div>;', FLAG),
    badStart(`${LAZY_WIDE} return <use xlink:href={wide} />;`, 'wide'),
  ],
});
