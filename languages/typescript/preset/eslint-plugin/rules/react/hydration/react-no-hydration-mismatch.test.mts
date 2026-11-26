import path from 'node:path';
import { useTemporaryProjects } from '../../../../test-support/temporary-projects.mts';
import { createReactRuleTester } from '../test-support/tester.mts';
import { rule } from './react-no-hydration-mismatch.mts';

const projects = useTemporaryProjects('nitpicker-hydration-', { keepForFile: true });
const root = projects.projectWith({
  'site/package.json': '{"name":"site","dependencies":{"next":"15.0.0","react":"19.0.0"}}',
  'spa/package.json': '{"name":"spa","dependencies":{"react":"19.0.0","vite":"6.0.0"}}',
});

const site = path.join(root, 'site/app/sidebar.tsx');
const spa = path.join(root, 'spa/src/sidebar.tsx');
const FLAG = "const isBrowser = typeof window !== 'undefined';";

function component(body: string, head = '') {
  return `${head}\nexport function Sidebar({ items, data }) { ${body} }`;
}

function ok(body: string, head = '', filename = site) {
  return { filename, code: component(body, head) };
}

function bad(body: string, head = '') {
  return {
    filename: site,
    code: component(body, head),
    errors: [{ messageId: 'mismatch' as const }],
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
  ],
});
