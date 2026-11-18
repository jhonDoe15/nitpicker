import { createReactRuleTester, filename } from '../test-support/tester.mts';
import { rule } from './react-no-eager-initial-value.mts';

const tester = createReactRuleTester();

function inPanel(body: string) {
  return `import { useState, useRef, useMemo } from 'react';
export function Panel({ range, now }) { ${body} return <div />; }`;
}

function valid(body: string) {
  return { filename, code: inPanel(body) };
}

function invalid(
  body: string,
  messageId: 'eagerInitial' | 'recreated',
  data: Record<string, string>,
) {
  return { filename, code: inPanel(body), errors: [{ messageId, data }] };
}

tester.run('react-no-eager-initial-value', rule, {
  valid: [
    'const [times, setTimes] = useState(() => getTimes(range, now));',
    'const [runner] = useState(() => new AlertingQueryRunner());',
    'const runner = useRef<Runner | null>(null);',
    'const count = useRef(0);',
    'const [value] = useState(props.initial);',
    'const [value] = useState(range.from);',
    'const [value] = useState(null);',
    'const [value] = useState(initial);',
    'const [times] = useState(getTimes(range, now));',
    'const [list] = useState(items.filter(isActive));',
    'const [model] = useState(config.getModel());',
    'const [month] = useState(monthUtils.currentMonth());',
    "const [error] = useState(t('It is required.'));",
    'const [label] = useState(formatOptions(options));',
    'const cancel = useRef(Promise.resolve());',
    'const abort = useRef(new AbortController());',
    'const defaults = useRef(createSearchParams(init));',
    'const [on] = useState(Boolean(initial));',
    'const [text] = useState(String(initial));',
    'const [n] = useState(Number(initial));',
    'const [n] = useState(Math.max(a, b));',
    'const [items] = useState(new Map());',
    'const [at] = useState(new Date());',
    'const stamp = useRef(Date.now());',
    'const [theme] = useState(useTheme());',
    'const value = useRef(new Animated.Value(0));',
    'const derived = useMemo(() => getTimes(range, now), [range, now]);',
    'const [value] = useState<number>();',
    'const [value] = useState();',
    'const [state] = useReducer(reducer, compute());',
    'const [value] = store.useState(compute());',
    'const router = useMemo(() => createBrowserRouter(routes), []);',
    'const [router] = useState(() => createBrowserRouter(routes));',
    'if (ref.current === null) { ref.current = createStore(); }',
    'const [store] = useState(() => createStore(reducer));',
    'const items = list.map(() => createStore());',
    'const handler = () => { const client = new QueryClient(); return client; };',
    'const fetcher = useCallback(() => new QueryClient(), []);',
    'const client = ref.current ?? (ref.current = new QueryClient());',
  ].map(valid),
  invalid: [
    invalid("const [v] = useState(localStorage.getItem('k'));", 'eagerInitial', {
      hook: 'useState',
    }),
    invalid('const id = useRef(crypto.randomUUID());', 'eagerInitial', { hook: 'useRef' }),
    invalid('const [q] = useState(new QueryClient());', 'eagerInitial', { hook: 'useState' }),
    invalid('const [times, setTimes] = useState(computeTimes(range, now));', 'eagerInitial', {
      hook: 'useState',
    }),
    invalid('const [list] = useState(JSON.parse(raw));', 'eagerInitial', {
      hook: 'useState',
    }),
    invalid('const [runner] = useState(new AlertingQueryRunner());', 'eagerInitial', {
      hook: 'useState',
    }),
    invalid('const runner = useRef(new AlertingQueryRunner());', 'eagerInitial', {
      hook: 'useRef',
    }),
    invalid('const worker = useRef(createWorker(url));', 'eagerInitial', { hook: 'useRef' }),
    invalid('const worker = useRef(new Worker(url) as Worker);', 'eagerInitial', {
      hook: 'useRef',
    }),
    invalid('const [x] = React.useState(compute());', 'eagerInitial', { hook: 'useState' }),
    invalid('const router = createBrowserRouter(routes);', 'recreated', {
      name: 'createBrowserRouter',
    }),
    invalid('const router = createMemoryRouter(routes, { initialEntries });', 'recreated', {
      name: 'createMemoryRouter',
    }),
    invalid('const store = configureStore({ reducer });', 'recreated', { name: 'configureStore' }),
    invalid('const client = new QueryClient();', 'recreated', { name: 'new QueryClient' }),
    {
      filename,
      code: `export const Provider = memo(() => { const store = createStore(reducer); return <S store={store} />; });`,
      errors: [{ messageId: 'recreated' as const, data: { name: 'createStore' } }],
    },
    {
      filename,
      code: `export function useAppStore() { const router = createHashRouter(routes); return router; }`,
      errors: [{ messageId: 'recreated' as const, data: { name: 'createHashRouter' } }],
    },
  ],
});

tester.run('react-no-eager-initial-value server components', rule, {
  valid: [
    {
      filename,
      code: 'export async function Page() { const client = new QueryClient(); return <p />; }',
    },
    {
      filename: filename.replace('panel', 'providers.server'),
      code: 'export function Page() { const client = new QueryClient(); return <p />; }',
    },
  ],
  invalid: [],
});
