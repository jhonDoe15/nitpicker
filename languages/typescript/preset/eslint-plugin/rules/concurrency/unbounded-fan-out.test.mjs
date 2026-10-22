import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './unbounded-fan-out.mjs';

const tester = typescriptRuleTester();
const unbounded = [{ messageId: 'unbounded' }];

function error(data) {
  return [
    {
      messageId: 'unbounded',
      data: { combinator: 'Promise.all', via: '', target: 'remote service', ...data },
    },
  ];
}

tester.run('unbounded-fan-out', rule, {
  valid: [
    'await Promise.all([fetch(a), fetch(b)]);',
    'await Promise.all(["a", "b"].map((url) => fetch(url)));',
    'const URLS = ["a", "b"]; await Promise.all(URLS.map((url) => fetch(url)));',
    'await Promise.all(Object.keys({ a: 1, b: 2 }).map((key) => fetch(key)));',
    'await Promise.all(urls.map((url) => url.trim()));',
    'await Promise.all(urls.map((url) => parse(url)));',
    'await Promise.all(rows.map((row) => db.load(row.id)));',
    'export async function run(urls, size) { for (let i = 0; i < urls.length; i += size) { await Promise.all(urls.slice(i, i + size).map((url) => fetch(url))); } }',
    'await Promise.all(urls.slice(0, 5).map((url) => fetch(url)));',
    'const SIZE = 20; await Promise.all(urls.slice(i, i + SIZE).map((url) => fetch(url)));',
    'for (let i = 0; i < urls.length; i += 20) { const chunk = urls.slice(i, i + 20); await Promise.all(chunk.map((url) => fetch(url))); }',
    'import { chunk } from "lodash"; for (const part of chunk(urls, 20)) { await Promise.all(part.map((url) => fetch(url))); }',
    'await Promise.all(Array.from({ length: 3 }, () => fetch(url)));',
    'import pLimit from "p-limit"; const limit = pLimit(8); await Promise.all(urls.map((url) => limit(() => fetch(url))));',
    'import pLimit from "p-limit"; const limit = pLimit(8); await Promise.all(urls.map(async (url) => { const response = await limit(() => fetch(url)); return response.json(); }));',
    'import PQueue from "p-queue"; const queue = new PQueue({ concurrency: 4 }); await Promise.all(urls.map((url) => queue.add(() => fetch(url))));',
    'import Bottleneck from "bottleneck"; const limiter = new Bottleneck({ maxConcurrent: 5 }); await Promise.all(urls.map((url) => limiter.schedule(() => fetch(url))));',
    'import { Sema } from "async-sema"; const sema = new Sema(4); await Promise.all(urls.map(async (url) => { await sema.acquire(); try { return await fetch(url); } finally { sema.release(); } }));',
    'const { default: pLimit } = await import("p-limit"); const limit = pLimit(5); await Promise.all(urls.map((url) => limit(() => fetch(url))));',
    'const pLimit = require("p-limit"); const limit = pLimit(5); await Promise.all(urls.map((url) => limit(() => fetch(url))));',
    'import renamed from "p-limit"; const gate = renamed(3); await Promise.all(urls.map((url) => gate(() => fetch(url))));',
    'export function run(urls, limit) { return Promise.all(urls.map((url) => limit(() => fetch(url)))); }',
    'const fetchOne = (url) => url.length; await Promise.all(urls.map((url) => fetchOne(url)));',
    'import axios from "axios"; await Promise.all(["a", "b"].map((url) => axios.get(url)));',
    'import { Kafka } from "kafkajs"; await Promise.all([1, 2].map((n) => producer.send({ topic: "t", messages: [n] })));',
    'const results = []; for (const url of urls) { results.push(await fetch(url)); } await Promise.all(results);',
    'const unknownClient = makeClient(); await Promise.all(urls.map((url) => unknownClient.get(url)));',
    'await Promise.all(urls.map((url) => response.headers.get(url)));',
    'import axios from "axios"; await Promise.all(urls.map((url) => axios.defaults.headers.get(url)));',
    'import pMap from "p-map"; await pMap(urls, (url) => fetch(url), { concurrency: 5 });',
    'import pMap from "p-map"; await pMap(urls, (url) => fetch(url), options);',
    'import pMap from "p-map"; await pMap(urls, (url) => url.length);',
    'import pLimit from "p-limit"; const limit = pLimit(Infinity); await Promise.all(urls.map((url) => limit(() => 1)));',
  ],
  invalid: [
    {
      code: 'await Promise.all(urls.map((url) => fetch(url)));',
      errors: error({ combinator: 'Promise.all', operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.allSettled(urls.map(async (url) => { const response = await fetch(url); return response.json(); }));',
      errors: error({ combinator: 'Promise.allSettled', operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.race(urls.map((url) => globalThis.fetch(url)));',
      errors: error({
        combinator: 'Promise.race',
        operation: 'globalThis.fetch()',
        collection: 'urls',
      }),
    },
    {
      code: 'import axios from "axios"; await Promise.all(ids.map((id) => axios.get(`/orders/${id}`)));',
      errors: error({ operation: 'axios.get()', collection: 'ids' }),
    },
    {
      code: 'import { default as http } from "axios"; await Promise.any(ids.map((id) => http.post("/x", id)));',
      errors: error({ combinator: 'Promise.any', operation: 'http.post()', collection: 'ids' }),
    },
    {
      code: 'import axios from "axios"; const api = axios.create({ baseURL: "/v1" }); await Promise.all(ids.map((id) => api.get(id)));',
      errors: error({ operation: 'api.get()', collection: 'ids' }),
    },
    {
      code: 'import * as web from "got"; await Promise.all(urls.map((url) => web.default(url)));',
      errors: unbounded,
    },
    {
      code: 'import got from "got"; await Promise.all(urls.map((url) => got(url).json()));',
      errors: error({ operation: 'got()', collection: 'urls' }),
    },
    {
      code: 'const axios = require("axios"); await Promise.all(urls.map((url) => axios.get(url)));',
      errors: error({ operation: 'axios.get()', collection: 'urls' }),
    },
    {
      code: 'import { request } from "undici"; await Promise.all(urls.map((url) => request(url)));',
      errors: error({ operation: 'request()', collection: 'urls' }),
    },
    {
      code: 'import fetchJson from "node-fetch"; await Promise.all(urls.map((url) => fetchJson(url)));',
      errors: error({ operation: 'fetchJson()', collection: 'urls' }),
    },
    {
      code: 'import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"; const s3 = new S3Client({}); await Promise.all(keys.map((key) => s3.send(new GetObjectCommand({ Key: key }))));',
      errors: error({ operation: 's3.send()', collection: 'keys' }),
    },
    {
      code: 'import { SQSClient } from "@aws-sdk/client-sqs"; const sqs = new SQSClient({}); await Promise.all(jobs.map((job) => sqs.send(job)));',
      errors: error({ operation: 'sqs.send()', collection: 'jobs', target: 'broker' }),
    },
    {
      code: 'import { Kafka } from "kafkajs"; const producer = new Kafka({}).producer(); await Promise.all(events.map((event) => producer.send({ topic: "t", messages: [event] })));',
      errors: error({ operation: 'producer.send()', collection: 'events', target: 'broker' }),
    },
    {
      code: 'import amqp from "amqplib"; const channel = await (await amqp.connect(url)).createChannel(); await Promise.all(jobs.map((job) => channel.sendToQueue("q", job)));',
      errors: error({ operation: 'channel.sendToQueue()', collection: 'jobs', target: 'broker' }),
    },
    {
      code: 'import OpenAI from "openai"; const ai = new OpenAI(); await Promise.all(prompts.map((p) => ai.chat.completions.create({ model: "m", messages: [p] })));',
      errors: error({ operation: 'ai.chat.completions.create()', collection: 'prompts' }),
    },
    {
      code: 'async function load(url) { const response = await fetch(url); return response.json(); } await Promise.all(urls.map((url) => load(url)));',
      errors: error({ operation: 'load()', via: ' (which calls `fetch()`)', collection: 'urls' }),
    },
    {
      code: 'async function leaf(url) { return fetch(url); } async function mid(url) { return leaf(url); } await Promise.all(urls.map(mid));',
      errors: error({ operation: 'leaf()', via: ' (which calls `fetch()`)', collection: 'urls' }),
    },
    {
      code: 'class Loader { async one(url) { return fetch(url); } async all(urls) { return Promise.all(urls.map((url) => this.one(url))); } }',
      errors: error({
        operation: 'this.one()',
        via: ' (which calls `fetch()`)',
        collection: 'urls',
      }),
    },
    {
      code: 'import axios from "axios"; class Api { private readonly http = axios.create(); all(ids: string[]) { return Promise.all(ids.map((id) => this.http.get(id))); } }',
      errors: error({ operation: 'this.http.get()', collection: 'ids' }),
    },
    {
      code: 'import type { AxiosInstance } from "axios"; export function all(api: AxiosInstance, ids: string[]) { return Promise.all(ids.map((id) => api.get(id))); }',
      errors: error({ operation: 'api.get()', collection: 'ids' }),
    },
    {
      code: 'const tasks = urls.map((url) => fetch(url)); await Promise.all(tasks);',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'const tasks = []; for (const url of urls) { tasks.push(fetch(url)); } await Promise.all(tasks);',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'const tasks = []; urls.forEach((url) => { tasks.push(fetch(url)); }); await Promise.all(tasks);',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.all([...urls.map((url) => fetch(url))]);',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.all(Array.from(urls, (url) => fetch(url)));',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.all(Object.keys(table).map((key) => fetch(key)));',
      errors: error({ operation: 'fetch()', collection: 'Object.keys(table)' }),
    },
    {
      code: 'import pLimit from "p-limit"; const limit = pLimit(8); await Promise.all(urls.map((url) => fetch(url)));',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'import PQueue from "p-queue"; const queue = new PQueue(); await Promise.all(urls.map((url) => queue.add(() => fetch(url))));',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'import pLimit from "p-limit"; await Promise.all(urls.map((url) => pLimit(8)(() => fetch(url))));',
      errors: unbounded,
    },
    {
      code: 'await Promise.all(urls.slice(0, urls.length - 1).map((url) => fetch(url)));',
      errors: error({ operation: 'fetch()', collection: 'urls.slice(0, urls.length - 1)' }),
    },
    {
      code: 'await Promise.all((limit ? urls.slice(0, limit) : urls).map((url) => fetch(url)));',
      errors: error({ operation: 'fetch()', collection: 'limit ? urls.slice(0, limit) : urls' }),
    },
    {
      code: 'import pMap from "p-map"; await pMap(urls, (url) => fetch(url));',
      errors: error({ combinator: 'pMap', operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'import pMap from "p-map"; await pMap(urls, async (url) => fetch(url), { concurrency: Infinity });',
      errors: error({ combinator: 'pMap', operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'const CONCURRENCY = 8; await Promise.all(urls.map((url) => fetch(url)));',
      errors: error({ operation: 'fetch()', collection: 'urls' }),
    },
    {
      code: 'await Promise.all(pages.map(async (page) => Promise.all(page.urls.map((url) => fetch(url)))));',
      errors: [
        ...error({ operation: 'fetch()', collection: 'pages' }),
        ...error({ operation: 'fetch()', collection: 'page.urls' }),
      ],
    },
  ],
});
