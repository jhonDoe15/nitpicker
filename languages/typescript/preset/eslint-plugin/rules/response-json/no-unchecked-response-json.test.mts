import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unchecked-response-json.mts';

const ruleTester = typescriptRuleTester();

const invalid = [
  'const res = await fetch(url); const data = await res.json();',
  'async function f(url) { const res = await fetch(url); return await res.json(); }',
  'async function f(url) { const res = await fetch(url); const data = (await res.json()) as Data; return data; }',
  'async function f(url) { const res = await globalThis.fetch(url); return res.json(); }',
  'async function f(url) { return (await fetch(url)).json(); }',
  'function f(url) { return fetch(url).then((res) => res.json()); }',
  'function f(url) { return fetch(url).then(function (r) { return r.json(); }); }',
  'async function f(url) { const res = await fetch(url); const data = await ' +
    'res.json(); if (!res.ok) { throw new Error(data.message); } return data; }',
  'async function f(url) { const res = await fetch(url); const text = await ' +
    'res.text(); return JSON.parse(text) && res.json(); }',
];

const valid = [
  'async function f(url) { const res = await fetch(url); if (!res.ok) { throw new ' +
    'Error(String(res.status)); } return res.json(); }',
  'async function f(url) { const res = await fetch(url); if (res.status !== 200) { return null; } return res.json(); }',
  'async function f(url) { const res = await fetch(url); if ' +
    '(!res.headers.get("content-type")?.includes("json")) { return null; } return ' +
    'res.json(); }',
  'async function f(url) { const res = await fetch(url); assertOk(res); return res.json(); }',
  'async function f(url) { const res = await fetch(url); const { ok } = res; if ' +
    '(!ok) { throw new Error("x"); } return res.json(); }',
  'async function f(url) { const res = await fetch(url); const text = await res.text(); return JSON.parse(text); }',
  'async function f(url) { const res = await fetch(url); try { return await res.json(); } catch { return null; } }',
  'async function f(url) { const res = await fetch(url); return res.json().catch(() => null); }',
  'function f(url) { return fetch(url).then((res) => { if (!res.ok) { throw new Error("x"); } return res.json(); }); }',
  'async function f(url) { const res = await axios.get(url); return res.json(); }',
  'async function f(url) { const res = await client.fetch(url); return res.json(); }',
  'async function f(req) { return req.json(); }',
  'async function f(res) { return res.json(); }',
  'async function f(res: Response) { return res.json(); }',
  'async function f(url) { const res = await fetch(url); return res.json(1); }',
  'async function f(url) { const res = await fetch(url); return res.text(); }',
];

ruleTester.run('no-unchecked-response-json', rule, {
  valid: cases(valid),
  invalid: invalid.map((code) => ({ code, errors: [{ messageId: 'uncheckedJson' as const }] })),
});
