import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-case-mixed-header-merge.mts';

const tester = typescriptRuleTester();

function flagged(code: string) {
  return { code, errors: [{ messageId: 'mixedCase' as const }] };
}

tester.run('no-case-mixed-header-merge', rule, {
  valid: [
    'const res = await fetch(url, { headers: new Headers(headers) });',
    'const res = await fetch(url, { headers: { ...headers } });',
    'const res = await fetch(url, { headers: { "Content-Type": "application/json" } });',
    'const res = await fetch(url, { headers: { "X-Trace": id, ...headers } });',
    'const res = await fetch(url, { headers: { "Content-Type": "application/json", ...normalize(headers) } });',
    'const res = await fetch(url, { headers: { "Content-Type": "application/json", ' +
      '...Object.fromEntries(new Headers(headers)) } });',
    'const lowered = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])); ' +
      'const res = await fetch(url, { headers: { "content-type": "application/json", ...lowered } });',
    'const base = { a: 1 }; const res = await fetch(url, { headers: { "Content-Type": ' +
      '"application/json", ...base } });',
    'const res = await fetch(url, { body: { "Content-Type": "application/json", ...headers } });',
    'const res = await fetch(url, { headers: { ...headers, "X-Other": "1" } });',
    'const merged = { "Content-Type": "application/json", ...data };',
    'const res = await fetch(url, { headers: { Authorization: token, ...(extra as object) } });',
    'const headers = { ...req.headers, host: u.host };',
    'const headers = { ...request.headers, ...custom, "content-type": "text/plain" };',
    'const defaults = { Accept: "application/json" }; const headers = { ...defaults };',
  ],
  invalid: [
    flagged(
      'const res = await fetch(url, { headers: { "Content-Type": "application/json", ...headers } });',
    ),
    flagged(
      'const res = await fetch(url, { headers: { ...headers, "Content-Type": "application/json" } });',
    ),
    flagged(
      'const res = await fetch(url, { headers: { "content-type": "application/json", ...options.headers } });',
    ),
    flagged(
      'const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...extraHeaders } });',
    ),
    flagged(
      'const res = await ky(url, { headers: { Accept: "x", ...(init?.headers as Record<string, string>) } });',
    ),
    flagged(
      'const headers = { "User-Agent": "tool", ...callerHeaders }; await got(url, { headers });',
    ),
    flagged(
      'async function send(init) { return axios.post(url, body, { headers: { "Content-Type": ' +
        '"application/json", ...init.headers } }); }',
    ),
    flagged('const headers = { ...req.headers, Host: u.host };'),
    flagged('const headers = { ...init?.headers, "content-type": "application/json" };'),
    flagged('let headers; headers = { "x-api-key": key, ...this.headers };'),
  ],
});
