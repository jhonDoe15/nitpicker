import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unresolved-relative-url.mts';

const tester = typescriptRuleTester();

function flagged(code: string, messageId: 'location' | 'redirect' | 'relative') {
  return { code, errors: [{ messageId }] };
}

tester.run('no-unresolved-relative-url', rule, {
  valid: [
    'const next = new URL(res.headers.location, url);',
    'const next = new URL(res.headers.get("location"), request.url);',
    'const next = new URL(res.headers.location ?? "", base).toString();',
    'return fetchJson(new URL(res.headers.location, url).toString(), redirects + 1);',
    'const next = new URL(options.url);',
    'const next = new URL("https://example.test/path");',
    'const next = new URL(`https://example.test/${path}`);',
    'const next = new URL(`${origin}/path`);',
    'const next = new URL("/path", origin);',
    'const next = new URL(`/path`, origin);',
    'fetch(res.headers.other);',
    'fetch(headers.location);',
    'fetch(new URL(res.headers.location, url));',
    'Response.redirect(new URL(`${pages.error}?error=Configuration`, request.url));',
    'Response.redirect("https://example.test/login");',
    'Response.redirect(url);',
    'NextResponse.redirect(new URL("/login", request.url));',
    'other.redirect("/login");',
    'res.redirect("/login");',
    'function f() { const target = res.headers.location; if (/^https?:/.test(target)) { fetch(target); } }',
    'axios.get(res.headers.etag);',
  ],
  invalid: [
    flagged('const next = new URL(res.headers.location);', 'location'),
    flagged('const next = new URL(res.headers["location"]);', 'location'),
    flagged('const next = new URL(res.headers.get("location")!);', 'location'),
    flagged('const next = new URL(response.headers.get("Location"));', 'location'),
    flagged('const location = res.headers.location; const next = new URL(location);', 'location'),
    flagged('const { location } = res.headers; return fetch(location);', 'location'),
    flagged(
      'function fetchJson(url, redirects) { return fetchJson(res.headers.location, redirects + 1); }',
      'location',
    ),
    flagged('https.get(res.headers.location, cb);', 'location'),
    flagged('axios.get(response.headers.location);', 'location'),
    flagged('return Response.redirect(`${pages.error}?error=Configuration`);', 'redirect'),
    flagged('return Response.redirect("/login");', 'redirect'),
    flagged('return NextResponse.redirect(`/login?next=${next}`);', 'redirect'),
    flagged('const target = new URL(`/api/${id}`);', 'relative'),
    flagged('const target = new URL("/api/items");', 'relative'),
  ],
});
