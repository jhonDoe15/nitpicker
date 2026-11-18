import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-double-decode.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'decoded' as const }] };
}

tester.run('no-double-decode', rule, {
  valid: [
    'const text = decodeURIComponent(location.search.slice(1));',
    'const hash = decodeURIComponent(location.hash);',
    'const raw = decodeURIComponent(new URL(request.url).search);',
    'const value = decodeURIComponent(request.url);',
    'const value = decodeURIComponent(req.headers["x-name"]);',
    'const value = decodeURIComponent(cookies.get("name"));',
    'const value = decodeURIComponent(map.get("name"));',
    'const value = decodeURIComponent(headers.get("x-name"));',
    'const value = decodeURIComponent(router.asPath);',
    'const value = decodeURIComponent(params.slug);',
    'const value = decodeURIComponent(text);',
    'const value = decodeURIComponent(router.query.error, extra);',
    'const message = router.query.error;',
    'const value = decodeURIComponent(parts[1]);',
    'const value = decodeURIComponent(segment.trim());',
    'const search = location.search; const value = decodeURIComponent(search);',
    'const value = decodeURIComponent(req.url.split("?")[1]);',
    'const value = other.decodeURIComponent(router.query.error);',
  ],
  invalid: [
    flagged(
      "const m = typeof router.query.error === 'string' ? decodeURIComponent(router.query.error) : null;",
    ),
    flagged('const v = decodeURIComponent(req.query.name);'),
    flagged('const v = decodeURIComponent(req.query.name as string);'),
    flagged('const v = decodeURI(req.params.id);'),
    flagged('const v = decodeURIComponent(request.params.id);'),
    flagged('const v = decodeURIComponent(ctx.query.callbackURL);'),
    flagged('const v = decodeURIComponent(ctx.query["callbackURL"]);'),
    flagged('const v = decodeURIComponent(url.searchParams.get("q") ?? "");'),
    flagged('const v = decodeURIComponent(new URLSearchParams(location.search).get("q")!);'),
    flagged(
      'const params = new URLSearchParams(text); const v = decodeURIComponent(params.get("q"));',
    ),
    flagged(
      'const searchParams = useSearchParams(); const v = decodeURIComponent(searchParams.get("q"));',
    ),
    flagged(
      'const [searchParams] = useSearchParams(); const v = decodeURIComponent(searchParams.get("q"));',
    ),
    flagged('const { error } = router.query; const v = decodeURIComponent(error);'),
    flagged('const error = router.query.error; const v = decodeURIComponent(error);'),
    flagged('const q = req.query.q; const v = decodeURIComponent(String(q));'),
    flagged('const v = decodeURIComponent(c.req.query("name"));'),
    flagged('const v = decodeURIComponent(c.req.param("id"));'),
    flagged('const v = decodeURIComponent(req.param("id"));'),
    flagged('const q = c.req.query(); const v = decodeURIComponent(q.name);'),
    flagged('function Page({ searchParams }) { return decodeURIComponent(searchParams.q); }'),
    flagged('const v = decodeURIComponent(router.query.error?.toString() ?? "");'),
    flagged(
      'const searchParams = new URLSearchParams(x); const v = decodeURIComponent(searchParams.getAll("q")[0]);',
    ),
  ],
});
