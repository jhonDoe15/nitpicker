import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../../../../../adapters/eslint/normalize.mts';
import { createRuleTester } from '../../guards/test-support/rule-tester.mjs';
import { rule as deadlineRule } from './promise-wait-deadline.mjs';
import { rule } from './require-promise-reject.mjs';

const tester = createRuleTester();
const missing = [{ messageId: 'missingReject' }];
const ignored = (name) => [{ messageId: 'ignoredError', data: { name, callee: 'form.parse' } }];

tester.run('require-promise-reject', rule, {
  valid: [
    'export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
    'export const tick = () => new Promise((resolve) => { process.nextTick(resolve); });',
    'export const later = () => new Promise((resolve) => globalThis.setTimeout(() => resolve(1), 5));',
    'export const value = () => new Promise((resolve) => { resolve(compute()); });',
    'export const sum = (items) => new Promise((resolve) => { resolve(items.map((item) => item * 2)); });',
    'export function wait(queue) { return new Promise((resolve) => { queue.push(resolve); }); }',
    'export function wait(waiters) { return new Promise((resolve) => waiters.add(() => resolve())); }',
    'export function ready() { return new Promise((resolve) => { this.markReady = resolve; }); }',
    'export function stop(signal) { return new Promise((resolve) => signal.addEventListener("abort", () => resolve())); }',
    'export function shutdown() { return new Promise((resolve) => process.once("SIGTERM", resolve)); }',
    'export function read(stream) { return new Promise((resolve, reject) => { stream.once("error", reject); stream.on("end", resolve); }); }',
    'export function read(stream) { return new Promise((resolve, fail) => stream.on("end", resolve).on("error", fail)); }',
    'export function read(stream, done) { return new Promise((resolve, reject) => { done.push({ resolve, reject }); stream.on("end", resolve); }); }',
    'export function parse(form, req) { return new Promise((resolve, reject) => form.parse(req, (error, fields) => { if (error) { reject(error); return; } resolve(fields); })); }',
    'export function parse(form, req) { return new Promise((resolve, reject) => form.parse(req, (err, fields) => (err ? reject(err) : resolve(fields)))); }',
    'export function parse(form, req) { return new Promise((resolve, reject) => form.parse(req, (fields) => resolve(fields), reject)); }',
    'export function first(task) { return new Promise((resolve, reject) => { task.then(resolve, reject); }); }',
    'export function settle(task) { return new Promise((resolve, reject) => { task.catch((error) => resolve(null)).finally(() => reject(new Error("x"))); }); }',
    'export function read(stream) { return new Promise((resolve, reject) => { stream.on("error", (error) => resolve(error)); stream.on("end", () => reject(new Error("x"))); }); }',
    'export function outer() { return new Promise((resolve, reject) => { const inner = new Promise((done) => done(1)); inner.then(resolve, reject); }); }',
    'export function run(executor) { return new Promise(executor); }',
    'export function never() { return new Promise(() => {}); }',
    `export function loads(src) { return new Promise((resolve) => { const image = new Image(); image.addEventListener('load', () => resolve(true)); image.addEventListener('error', () => resolve(false)); image.src = src; }); }`,
    `export function drain(s) { return new Promise((resolve) => { s.on('error', () => resolve(null)); s.on('end', () => resolve(1)); }); }`,
    `export function exists(fs, p) { return new Promise((resolve) => fs.access(p, (err) => resolve(!err))); }`,
    `export function probe(exec, cmd) { return new Promise((resolve) => exec(cmd, (error, stdout) => resolve({ error, stdout }))); }`,
    `export function parsed(a) { return new Promise((resolve) => { resolve(JSON.parse(a, (key, value) => value)); }); }`,
    `export function grouped(items) { return new Promise((resolve) => { const groups = groupBy(items, (item) => item.kind); resolve(groups); }); }`,
    `export function ended(s, log) { return new Promise((resolve, reject) => { log.info(() => 'x'); s.on('end', () => resolve(1)); s.on('error', reject); }); }`,
    `export function seen(el) { return new Promise((resolve) => { new IntersectionObserver(() => resolve()).observe(el); }); }`,
    `export function loaded() { return new Promise((resolve) => window.addEventListener('load', resolve)); }`,
    `export function shown() { return new Promise((resolve) => document.addEventListener('visibilitychange', () => resolve())); }`,
  ],
  invalid: [
    {
      code: 'export function body(s) { const chunks = []; return new Promise((resolve) => { s.on("data", (chunk) => chunks.push(chunk)); s.on("end", () => resolve(chunks)); }); }',
      errors: [{ messageId: 'missingReject', data: { source: "`s.on('end')`" } }],
    },
    {
      code: 'export function collect(body) { return new Promise((resolve) => body.pipe(concat(resolve))); }',
      errors: [{ messageId: 'missingReject', data: { source: '`body.pipe(...)`' } }],
    },
    {
      code: 'export function parse(form, req) { return new Promise((resolve) => form.parse(req, (error, fields) => resolve(fields))); }',
      errors: [
        { messageId: 'missingReject', data: { source: 'the callback passed to `form.parse`' } },
      ],
    },
    {
      code: 'export function read(stream) { return new Promise((resolve, _reject) => { stream.on("end", resolve); }); }',
      errors: [{ messageId: 'missingReject', data: { source: "`stream.on('end')`" } }],
    },
    {
      code: 'export function connect(socket) { return new Promise(function (resolve) { socket.addEventListener("open", () => resolve(socket)); }); }',
      errors: missing,
    },
    {
      code: 'const READY = "ready"; export function start(worker) { return new Promise((resolve) => worker.once(READY, resolve)); }',
      errors: [{ messageId: 'missingReject', data: { source: "`worker.once('ready')`" } }],
    },
    {
      code: 'export function close(server) { return new Promise((resolve) => server.close(() => resolve())); }',
      errors: missing,
    },
    {
      code: 'export function listen(server, port) { return new Promise((resolve) => server.listen(port, resolve)); }',
      errors: missing,
    },
    {
      code: 'export function first(task) { return new Promise((resolve) => { task.then(resolve); }); }',
      errors: missing,
    },
    {
      code: 'export function watch(target) { return new Promise((resolve) => { new Watcher(target, () => resolve()); }); }',
      errors: missing,
    },
    {
      code: 'export function parse(form, req) { return new Promise((resolve, reject) => { form.once("aborted", reject); form.parse(req, (error, fields) => resolve(fields)); }); }',
      errors: ignored('error'),
    },
    {
      code: 'export function parse(form, req) { return new Promise((resolve, reject) => { form.once("aborted", reject); form.parse(req, (_err, fields) => { log(fields); setImmediate(() => resolve(fields)); }); }); }',
      errors: ignored('_err'),
    },
    {
      code: 'export function parse(form, req) { return new Promise((resolve, reject) => { form.once("aborted", reject); form.parse(req, function (parseError, fields) { resolve(fields); }); }); }',
      errors: ignored('parseError'),
    },
  ],
});

tester.run('promise-wait-deadline', deadlineRule, {
  valid: [
    'export function read(stream) { return new Promise((resolve, reject) => { stream.on("end", resolve); stream.on("error", reject); }); }',
    'export function read(socket, ms) { const timer = setTimeout(() => socket.destroy(), ms); return new Promise((resolve, reject) => { socket.on("end", resolve); socket.on("error", reject); }); }',
    'export function read(socket) { return new Promise((resolve, reject) => { socket.setTimeout(5000, () => reject(new Error("idle"))); socket.on("end", resolve); socket.on("error", reject); }); }',
    'export function read(socket) { return new Promise((resolve, reject) => { socket.on("timeout", () => socket.destroy()); socket.on("end", resolve); socket.on("error", reject); }); }',
    'export function read(req, signal) { return new Promise((resolve, reject) => { req.on("end", resolve); req.on("error", reject); }); }',
    'export function read(res) { return new Promise((resolve, reject) => { res.on("end", resolve); res.on("error", reject); resolve(null); }); }',
    'export function read(res) { return new Promise((resolve) => { res.on("end", resolve); }); }',
  ],
  invalid: [
    {
      code: 'export function body(res) { return new Promise((resolve, reject) => { const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve(chunks)); res.on("error", reject); }); }',
      errors: [{ messageId: 'noDeadline', data: { receiver: 'res' } }],
    },
    {
      code: 'export function frame(socket) { return new Promise((resolve, reject) => socket.once("message", resolve).once("error", reject)); }',
      errors: [{ messageId: 'noDeadline' }],
    },
  ],
});

function classified(ruleId) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-promise-note-'));
  try {
    writeFileSync(path.join(root, 'read.ts'), 'export const read = 1;\n');
    const message = { ruleId, message: 'Text.', severity: 2, line: 1, column: 1 };
    const [finding] = normalizeEslintResults({
      value: [{ filePath: path.join(root, 'read.ts'), messages: [message] }],
      projectRoot: root,
      analyzerName: 'eslint-strict',
    });
    return finding.classification;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('the deadline finding', () => {
  it('is a design note, while a missing rejection path fails', () => {
    expect(classified('nitpicker/promise-wait-deadline')).toBe('descriptive');
    expect(classified('nitpicker/require-promise-reject')).toBe('enforceable');
  });
});
