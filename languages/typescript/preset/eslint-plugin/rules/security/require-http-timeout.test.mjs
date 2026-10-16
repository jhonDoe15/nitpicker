import { createRuleTester } from '../guards/test-support/rule-tester.mjs';
import { rule as requireHttpTimeout } from './require-http-timeout.mjs';

const tester = createRuleTester();
const missing = (call) => [{ messageId: 'noTimeout', data: { call } }];

tester.run('require-http-timeout', requireHttpTimeout, {
  valid: [
    'let n = 1; n = 2; export default n;',
    'export const get = (url) => fetch(url, { signal: AbortSignal.timeout(10_000) });',
    'export const get = (url, signal) => fetch(url, { method: "GET", signal });',
    'export const get = (url, init) => fetch(url, init);',
    'export const get = (url, init) => fetch(url, { ...init, method: "GET" });',
    'const OPTIONS = { signal: AbortSignal.timeout(5000) }; export const get = (url) => fetch(url, OPTIONS);',
    'export const get = (url) => globalThis.fetch(url, { signal: AbortSignal.timeout(5000) });',
    'const request = fetch; export const get = (url) => request(url, { signal: AbortSignal.timeout(5000) });',
    'export const get = (request) => fetch(new Request(request, { signal: AbortSignal.timeout(5000) }));',
    'import axios from "axios"; export const get = (url) => axios.get(url, { timeout: 10_000 });',
    'import axios from "axios"; export const post = (url, body) => axios.post(url, body, { timeout: 10_000 });',
    'import axios from "axios"; export const client = axios.create({ baseURL: "https://api.test", timeout: 10_000 });',
    'import axios from "axios"; const config = { timeout: 5000 }; export const get = (url) => axios.get(url, config);',
    'import axios from "axios"; export const get = (url, config) => axios.get(url, config);',
    'import axios from "axios"; axios.defaults.timeout = 5000; export const get = (url) => axios.get(url);',
    'import axios from "axios"; export const client = axios.create({ timeout: 5000 }); export const get = (url) => client.get(url);',
    'import https from "node:https"; export const get = (url) => https.get(url, { timeout: 5000 }, (res) => res.resume());',
    'import https from "node:https"; export const get = (url, signal) => https.get(url, { signal }, (res) => res.resume());',
    'import https from "node:https"; export const get = (url) => { const req = https.get(url, (res) => res.resume()); req.setTimeout(5000); return req; };',
    'import { request } from "node:http"; export const send = (options) => request(options, (res) => res.resume());',
    'import got from "got"; export const get = (url) => got(url, { timeout: { request: 5000 } });',
    'import got from "got"; export const client = got.extend({ timeout: { request: 5000 } });',
    'export const get = (cache, key) => cache.get(key);',
    'export const fetchUser = (id) => repository.fetch(id);',
    'import fetch from "./fetch.js"; export const get = (url) => fetch(url);',
    'export function fetch(url) { return url; } export const get = (url) => fetch(url);',
  ],
  invalid: [
    { code: 'export const get = (url) => fetch(url);', errors: missing('fetch()') },
    {
      code: 'export const get = (url) => fetch(url, { method: "POST", body: "x" });',
      errors: missing('fetch()'),
    },
    {
      code: 'export const get = (url) => globalThis.fetch(url);',
      errors: missing('fetch()'),
    },
    {
      code: 'export const get = (url) => window.fetch(url, {});',
      errors: missing('fetch()'),
    },
    {
      code: 'const request = fetch; export const get = (url) => request(url);',
      errors: missing('fetch()'),
    },
    {
      code: 'const OPTIONS = { method: "GET" }; export const get = (url) => fetch(url, OPTIONS);',
      errors: missing('fetch()'),
    },
    {
      code: 'export const get = (url) => fetch(url, { signal: undefined });',
      errors: missing('fetch()'),
    },
    {
      code: 'import fetch from "node-fetch"; export const get = (url) => fetch(url);',
      errors: missing('fetch()'),
    },
    {
      code: 'import { fetch } from "undici"; export const get = (url) => fetch(url);',
      errors: missing('fetch()'),
    },
    {
      code: 'import axios from "axios"; export const get = (url) => axios.get(url);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; export const get = (url) => axios.get(url, { headers: {} });',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; export const post = (url, body) => axios.post(url, body);',
      errors: missing('axios.post()'),
    },
    {
      code: 'import axios from "axios"; export const get = (url) => axios({ url });',
      errors: missing('axios()'),
    },
    {
      code: 'import axios from "axios"; export const get = (url) => axios.get(url, { timeout: 0 });',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; export const client = axios.create({ baseURL: "https://api.test" });',
      errors: missing('axios.create()'),
    },
    {
      code: 'const axios = require("axios"); exports.get = (url) => axios.get(url);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import { request } from "node:http"; export const send = () => request({ host: "x", method: "POST" }, (res) => res.resume());',
      errors: missing('http.request()'),
    },
    {
      code: 'import * as https from "https"; export const send = () => https.request("https://x.test", { method: "POST" });',
      errors: missing('http.request()'),
    },
    {
      code: 'import got from "got"; export const get = (url) => got(url);',
      errors: missing('got()'),
    },
    {
      code: 'import got from "got"; export const get = (url) => got.get(url, { retry: { limit: 1 } });',
      errors: missing('got()'),
    },
    {
      code: 'import got from "got"; export const client = got.extend({ prefixUrl: "https://api.test" });',
      errors: missing('got()'),
    },
  ],
});

tester.run('require-http-timeout with fetch turned off', requireHttpTimeout, {
  valid: [{ code: 'export const get = (url) => fetch(url);', options: [{ fetch: false }] }],
  invalid: [
    {
      code: 'import axios from "axios"; export const get = (url) => axios.get(url);',
      options: [{ fetch: false }],
      errors: missing('axios.get()'),
    },
  ],
});
