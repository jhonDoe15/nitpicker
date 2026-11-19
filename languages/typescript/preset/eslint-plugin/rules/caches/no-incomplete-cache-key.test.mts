import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-incomplete-cache-key.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/cache.ts';
const IMPORT = "import { useQuery } from '@tanstack/react-query';\n";

const queryKey = (names: string) => ({ messageId: 'queryKey' as const, data: { names } });
const cacheKey = (names: string) => ({ messageId: 'cacheKey' as const, data: { names } });

tester.run('no-incomplete-cache-key queries', rule, {
  valid: [
    'function C({ slug }) { return useQuery({ queryKey: ["a", slug], queryFn: () => load(slug) }); }',
    'function C() { const { env } = useEnv(); return useQuery({ queryKey: ["a", env?._id], queryFn: () => load(env?._id) }); }',
    'function C() { const api = useApi(); return useQuery({ queryKey: ["a"], queryFn: () => api.get() }); }',
    'function C() { const qc = useQueryClient(); return useQuery({ queryKey: ["a"], queryFn: () => qc.get() }); }',
    'function C() { const base = "x"; return useQuery({ queryKey: ["a"], queryFn: () => load(base) }); }',
    'function C({ id }) { return useQuery({ queryKey: ["a", id], queryFn: ({ signal }) => load(id, signal) }); }',
    'function C({ id }) { return useQuery({ queryKey: ["a", id], queryFn: async () => { const local = id + 1; return load(local); } }); }',
    'function C() { return useQuery({ queryKey: ["a"], queryFn: () => load(MODULE_CONSTANT) }); }',
    'function C({ load }) { return useQuery({ queryKey: ["a"], queryFn: () => load() }); }',
    'function C({ id }) { return useQuery({ queryKey: key, queryFn: () => load(id) }); }',
    'function C({ id }) { return useQuery({ queryKey: ["a"], queryFn }); }',
    'function C({ id }) { return useQuery(queryOptions<Item[]>({ queryKey: ["a", id], queryFn: () => load(id) })); }',
    'function C<T>({ id }) { return useQuery({ queryKey: ["a", id], queryFn: (): Promise<T[]> => load(id) }); }',
    'function C(o) { const req = toRequest(o); return useQuery({ queryKey: ["a", req], queryFn: () => load(o) }); }',
    'function C({ accessToken }) { return useQuery({ queryKey: ["a"], queryFn: () => load(accessToken) }); }',
    'function C({ credentials }) { return useQuery({ queryKey: ["a"], queryFn: () => load(credentials) }); }',
    'function C({ onDone }) { return useQuery({ queryKey: ["a"], queryFn: () => load().then(onDone) }); }',
    'function C() { const { t } = useTranslation(); return useQuery({ queryKey: ["a"], queryFn: () => load(t) }); }',
  ].map((code) => ({ filename, code: `${IMPORT}${code}` })),
  invalid: [
    {
      code: 'function C({ slug }) { return useQuery({ queryKey: ["a"], queryFn: () => load(slug) }); }',
      names: '`slug`',
    },
    {
      code: 'function C() { const { env } = useEnv(); return useQuery({ queryKey: ["a", slug], queryFn: () => load({ environmentId: env?._id, slug }) }); }',
      names: '`env`',
    },
    {
      code: 'function C() { const { id } = useParams(); return useQuery({ queryKey: ["a"], queryFn: () => load(id) }); }',
      names: '`id`',
    },
    {
      code: 'function C(a, b) { return useQuery({ queryKey: ["a"], queryFn: async function () { return load(a, b); } }); }',
      names: '`a`, `b`',
    },
  ].map(({ code, names }) => ({
    filename,
    code: `${IMPORT}${code}`,
    errors: [queryKey(names)],
  })),
});

tester.run('no-incomplete-cache-key without a query library', rule, {
  valid: [
    {
      filename,
      code: 'function C({ slug }) { return useQuery({ queryKey: ["a"], queryFn: () => load(slug) }); }',
    },
  ],
  invalid: [],
});

const MEMO = (body: string, params = 'base, variant, table') =>
  `const cache = new Map();\nfunction build(${params}) {\n${body}\n}`;

tester.run('no-incomplete-cache-key memo caches', rule, {
  valid: [
    MEMO(
      `const key = \`\${base}:\${variant}:\${table}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, table); cache.set(key, m); } return m;`,
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant); cache.set(key, m); } return m;`,
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, logger); cache.set(key, m); } return m;`,
      'base, variant, logger',
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, signal); cache.set(key, m); } return m;`,
      'base, variant, signal',
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, fn(base)); cache.set(key, m); } return m;`,
      'base, variant, fn',
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, c); cache.set(key, m); } return m;`,
      'base, variant, c: AbortSignal',
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { logger.debug(table); m = merge(base, variant); cache.set(key, m); } return m;`,
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant); log.info("m", table); cache.set(key, m); } return m;`,
    ),
    MEMO(`const key = \`\${base}:\${variant}\`; cache.set(key, merge(base, variant, table));`),
    MEMO(
      'const key = "fixed"; let m = cache.get(key); if (!m) { m = merge(base, table); cache.set(key, m); } return m;',
    ),
    MEMO(
      `const key = \`\${options.a}\`; let m = cache.get(key); if (!m) { m = merge(options.b); cache.set(key, m); } return m;`,
      'options',
    ),
    MEMO(
      `const key = \`\${base}:\${variant}\`; const m = merge(base, variant); other.set(key, table); return cache.get(key) ?? m;`,
    ),
    `function build(base, table) { const cache = new Map(); const key = \`\${base}\`; const hit = cache.get(key); if (hit) return hit; const m = merge(base, table); cache.set(key, m); return m; }`,
    `const cache = new Map();\nfunction build(base, table) { const key = \`\${base}\`; const hit = cache.get(key); if (hit) return hit; const m = merge(base, table); cache.set(key, m); return m; }\nexport function reset() { cache.clear(); }`,
    MEMO(
      `const key = \`\${base}\`; const hit = cache.get(key); if (hit) return hit; const m = merge(base, token); cache.set(key, m); return m;`,
      'base, token',
    ),
    `function addPair(pairs, base, sha) { const key = \`\${base}\`; const entry = pairs.get(key); if (entry === undefined) { pairs.set(key, { sha }); return; } entry.count += 1; }`,
    `function collect(base, sha) { const key = \`\${base}\`; if (!seen.has(key)) { seen.set(key, { sha }); } }`,
    `function holeOf(state, kind, left) { const key = \`\${left}\`; if (!state.holes.has(key)) { state.holes.set(key, { kind }); } return 1; }`,
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: MEMO(
        `const key = \`\${base}:\${variant}\`; let m = cache.get(key); if (!m) { m = merge(base, variant, table); cache.set(key, m); } return m;`,
      ),
      names: '`table`',
    },
    {
      code: MEMO(
        'const key = base + ":" + variant; if (cache.has(key)) return cache.get(key); const m = merge(base, variant, table); cache.set(key, m); return m;',
      ),
      names: '`table`',
    },
    {
      code: MEMO(
        'const key = [base, variant].join(":"); const hit = cache.get(key); if (hit) return hit; const m = merge(base, variant, table); cache.set(key, m); return m;',
      ),
      names: '`table`',
    },
    {
      code: MEMO(
        `const key = \`\${base}\`; const hit = cache.get(key); if (hit) return hit; const prepared = prepare(variant); const m = merge(base, prepared); cache.set(key, m); return m;`,
      ),
      names: '`variant`',
    },
    {
      code: `const outer = new Map();\nfunction build(model, variant, table) { const key = \`\${model}:\${variant}\`; let inner = outer.get(model); if (!inner) { inner = new Map(); outer.set(model, inner); } let m = inner.get(key); if (!m) { m = merge(model, variant, table); inner.set(key, m); } return m; }`,
      names: '`table`',
    },
    {
      code: `class R { cache = new Map(); find(host, org) { const key = \`\${host}\`; const hit = this.cache.get(key); if (hit) return hit; const c = create(host, org); this.cache.set(key, c); return c; } }`,
      names: '`org`',
    },
    {
      code: MEMO(
        'const key = JSON.stringify({ base }); const hit = cache.get(key); if (hit) return hit; const m = merge(base, { variant }); cache.set(key, m); return m;',
        'base, variant',
      ),
      names: '`variant`',
    },
  ].map(({ code, names }) => ({ filename, code, errors: [cacheKey(names)] })),
});
