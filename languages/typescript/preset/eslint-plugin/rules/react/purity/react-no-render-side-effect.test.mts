import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-no-render-side-effect.mts';

const tester = createReactRuleTester();
const head = `import { useEffect, useState } from 'react';
import { useHistory, useNavigate } from 'react-router-dom';
import { useRouter } from 'next/navigation';`;

function inPanel(body: string) {
  return `${head}
export function Panel({ user, title, navigate: go, past }) {
  const navigate = useNavigate();
  const router = useRouter();
  ${body}
  return <div>{title}</div>;
}`;
}

function valid(body: string) {
  return { filename, code: inPanel(body) };
}

function invalid(body: string, messageId: 'navigation' | 'listener' | 'title', call = '') {
  return { filename, code: inPanel(body), errors: [{ messageId, data: { call } }] };
}

tester.run('react-no-render-side-effect', rule, {
  valid: [
    "useEffect(() => { if (!user) { navigate('/login'); } }, [user, navigate]);",
    "const open = () => { navigate('/next'); router.push('/next'); document.title = title; };",
    "useEffect(() => { document.title = title; document.addEventListener('click', close); return () => { document.removeEventListener('click', close); }; }, [title]);",
    "go('/next');",
    "past.push('/next');",
    "router.prefetch('/next');",
    'const target = router.push;',
    "window.addEventListener('resize', onResize);",
    "node.addEventListener('click', onClick);",
    "const document = useFrame(); document.addEventListener('click', onClick); document.title = title;",
    'page.title = title;',
    'const label = document.title;',
    'if (!user) { return <Navigate to="/login" />; }',
    "if (!user) { redirect('/login'); }",
    "const mine = useMine(); mine.push('/next');",
    "const { push } = useRouter(); push('/next');",
    'const allowed = user && router.asPath;',
    'const frame = useFrame(); const self = frame; self.document.title = title;',
  ].map(valid),
  invalid: [
    invalid("navigate('/login');", 'navigation', 'navigate(...)'),
    invalid("if (!user) { navigate('/login'); return null; }", 'navigation', 'navigate(...)'),
    invalid("router.push('/login');", 'navigation', 'router.push(...)'),
    invalid("if (!user) { router.replace('/login'); }", 'navigation', 'router.replace(...)'),
    invalid(
      "const history = useHistory(); if (user.expired) { history.push('/login'); }",
      'navigation',
      'history.push(...)',
    ),
    invalid(
      "document.addEventListener('keydown', onKey);",
      'listener',
      'document.addEventListener(...)',
    ),
    invalid(
      "window.document.body.addEventListener('click', onClick);",
      'listener',
      'window.document.body.addEventListener(...)',
    ),
    invalid("!user && navigate('/login');", 'navigation', 'navigate(...)'),
    invalid("user ? undefined : router.push('/login');", 'navigation', 'router.push(...)'),
    invalid("void navigate?.('/login');", 'navigation', 'navigate(...)'),
    invalid('document.title += title;', 'title'),
    invalid('document.title = title;', 'title'),
    invalid(`if (title) { window.document.title = \`\${title} | App\`; }`, 'title'),
  ],
});

tester.run('react-no-render-side-effect scope', rule, {
  valid: [
    {
      filename,
      code: `import { useRouter } from 'vue-router';
export function Panel({ title }) { const router = useRouter(); router.push('/x'); return <div>{title}</div>; }`,
    },
    {
      filename,
      code: `export function Bootstrap(element) { document.title = 'App'; createRoot(element).render(<App />); }`,
    },
    {
      filename,
      code: `export function Panel({ window, title }) { window.document.title = title; return <div>{title}</div>; }`,
    },
    {
      filename,
      code: `export function Rows({ items }) { document.title = 'Rows'; items.forEach((item) => { mount(<li>{item}</li>); }); }`,
    },
    {
      filename,
      code: `${head}
export function useTitle(title) {
  const [shown] = useState(title);
  useEffect(() => { document.title = shown; }, [shown]);
}`,
    },
    {
      filename,
      code: `export function useSubscribe(callback) { document.addEventListener('visibilitychange', callback); return () => { document.removeEventListener('visibilitychange', callback); }; }`,
    },
    {
      filename,
      code: `export function setTitle(title) { document.title = title; }
export function Helper(title) { document.title = title; return title; }`,
    },
    {
      filename,
      code: `${head}
export async function Page({ title }) { const router = useRouter(); router.push('/x'); return <div>{title}</div>; }`,
    },
    {
      filename: '/repo/src/main/ui/panel.server.tsx',
      code: `export function Page({ title }) { document.title = title; return <div>{title}</div>; }`,
    },
  ],
  invalid: [
    {
      filename,
      code: `${head}
export function useGuard(user) { const navigate = useNavigate(); if (!user) { navigate('/login'); } }`,
      errors: [{ messageId: 'navigation', data: { call: 'navigate(...)' } }],
    },
    {
      filename,
      code: `${head}
export const useTitle = (title) => { const [shown] = useState(title); document.title = shown; };`,
      errors: [{ messageId: 'title', data: { call: '' } }],
    },
    {
      filename,
      code: `import { memo } from 'react';
export const Panel = memo(({ title }) => { document.title = title; return <div>{title}</div>; });`,
      errors: [{ messageId: 'title', data: { call: '' } }],
    },
  ],
});
