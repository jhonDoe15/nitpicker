import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule } from './require-http-timeout.mjs';

const tester = createRuleTester();
const missing = (call) => [{ messageId: 'noTimeout', data: { call } }];

tester.run('require-http-timeout with signals, defaults and passthrough', rule, {
  valid: [
    'export async function g(u: string) { const init: RequestInit = { method: "GET" }; init.signal = AbortSignal.timeout(5000); return fetch(u, init); }',
    'import axios from "axios"; export function g(u: string) { const config: any = {}; config.timeout = 5000; return axios.get(u, config); }',
    'export function g(u: string, extra: object) { const init = { method: "GET" }; Object.assign(init, extra); return fetch(u, init); }',
    'import axios from "axios"; export const get = (u: string) => axios.get(u, { signal: AbortSignal.timeout(5000) });',
    'import axios from "axios"; export const post = (u: string, body: unknown) => axios.post(u, body, { signal: AbortSignal.timeout(5000) });',
    'import axios from "axios"; export function load(u: string, signal: AbortSignal) { return axios.get(u, { signal }); }',
    'import got from "got"; export const get = (u: string) => got(u, { signal: AbortSignal.timeout(5000) }).json();',
    'import axios from "axios"; export const link = (q: string) => axios.getUri({ url: "/search", params: { q } });',
    'self.addEventListener("fetch", (event: any) => { event.respondWith(fetch(event.request)); });',
    'export default { fetch(request: Request) { return fetch(request); } };',
    'export const g = (request: Request) => fetch(request, { signal: AbortSignal.timeout(5000) });',
    'import { Agent } from "undici"; const dispatcher = new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }); export const get = (u: string) => fetch(u, { dispatcher } as RequestInit);',
    'import { Agent, setGlobalDispatcher } from "undici"; setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 })); export const get = (u: string) => fetch(u);',
    'import { Agent, setGlobalDispatcher, fetch } from "undici"; const agent = new Agent({ bodyTimeout: 10_000 }); setGlobalDispatcher(agent); export const get = (u: string) => fetch(u);',
    {
      code: 'import axios from "axios"; import "./http-defaults"; export const get = (u: string) => axios.get(u);',
      options: [{ projectDefaults: ['axios'] }],
    },
    {
      code: 'export const get = (u: string) => fetch(u);',
      options: [{ projectDefaults: ['fetch'] }],
    },
    'import axios from "axios"; const api = axios.create({ baseURL: "/api" }); export const get = (u: string) => api.get(u, { timeout: 5000 }); export const post = (u: string, b: unknown) => api.post(u, b, { signal: AbortSignal.timeout(5000) });',
    'import fetch from "node-fetch"; export const get = (u: string) => fetch(u, { timeout: 5000 });',
    'export const toBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());',
    'export const pixel = () => fetch("data:image/png;base64,AAAA");',
    'export const wasm = () => fetch(new URL("./lib.wasm", import.meta.url));',
    'export const read = (blob: Blob) => fetch(URL.createObjectURL(blob));',
    'import https from "node:https"; export const get = () => { const req = https.request({ host: "x" }, (res) => res.resume()).on("error", () => undefined); req.setTimeout(5000); req.end(); return req; };',
    'import https from "node:https"; export const get = (u: string, options: object, onResponse: () => void) => https.get(u, options, onResponse);',
    'const axios = require("axios").default; export const g = (u) => axios.get(u, { timeout: 5000 });',
  ],
  invalid: [
    {
      code: 'export const g = (u: string) => fetch(new Request(u, { method: "POST" }));',
      errors: missing('fetch()'),
    },
    { code: 'export const g = (u: string) => fetch(new Request(u));', errors: missing('fetch()') },
    {
      code: 'export const g = (request: Request) => fetch(request, { method: "POST" });',
      errors: missing('fetch()'),
    },
    {
      code: 'import https from "node:https"; function onResponse(res: any) { res.resume(); } export const g = () => https.get("https://api.test/x", onResponse);',
      errors: missing('http.get()'),
    },
    {
      code: 'import https from "node:https"; const onResponse = (res: any) => res.resume(); export const g = (host: string) => https.request({ host, method: "POST" }, onResponse);',
      errors: missing('http.request()'),
    },
    {
      code: 'import https from "node:https"; export const g = (host: string) => new Promise((resolve) => { https.get({ host }, resolve); });',
      errors: missing('http.get()'),
    },
    {
      code: 'import https from "node:https"; export const g = (host: string, onError: () => void, cb: () => void) => { const req = https.request({ host }, cb).on("error", onError); req.end(); return req; };',
      errors: missing('http.request()'),
    },
    {
      code: 'const axios = require("axios").default; export const g = (u) => axios.get(u);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import { default as axios } from "axios"; export const g = (u: string) => axios.get(u);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios = require("axios"); export const g = (u: string) => axios.get(u);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; const a = axios.create({ timeout: 1 }); a.defaults.timeout = 5000; export const b = axios.create({ baseURL: "x" });',
      errors: missing('axios.create()'),
    },
    {
      code: 'import axios from "axios"; const settings: any = {}; settings.defaults.timeout = 1; export const g = (u: string) => axios.get(u);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; axios.defaults.timeout = 0; export const g = (u: string) => axios.get(u);',
      errors: missing('axios.get()'),
    },
    {
      code: 'import axios from "axios"; const api = axios.create({ baseURL: "/api" }); export const get = (u: string) => api.get(u, { timeout: 5000 }); export const all = (u: string) => api.get(u);',
      errors: missing('axios.create()'),
    },
    {
      code: 'import axios from "axios"; export const g = (u: string) => axios.get(u, { signal: undefined });',
      errors: missing('axios.get()'),
    },
    {
      code: 'import { Agent, setGlobalDispatcher } from "undici"; setGlobalDispatcher(new Agent({ keepAliveTimeout: 1000 })); export const get = (u: string) => fetch(u);',
      errors: missing('fetch()'),
    },
    {
      code: 'import fetch from "node-fetch"; export const get = (u: string) => fetch(u, { timeout: 5000 });',
      options: [{ nodeFetchTimeout: false }],
      errors: missing('fetch()'),
    },
    {
      code: 'export const get = (u: string) => fetch(u, { timeout: 5000 } as RequestInit);',
      errors: missing('fetch()'),
    },
    {
      code: 'import axios from "axios"; export const get = (u: string) => axios.get(u);',
      options: [{ projectDefaults: ['fetch'] }],
      errors: missing('axios.get()'),
    },
  ],
});
