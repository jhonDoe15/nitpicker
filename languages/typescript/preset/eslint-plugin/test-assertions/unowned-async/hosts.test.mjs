import { FS, runCases } from './test-support/rule-cases.mjs';

const HTTP = "import http from 'node:http';\n";
const RX = "import { of, interval, EMPTY } from 'rxjs';\nimport { delay } from 'rxjs/operators';\n";
const VUE = "import { nextTick } from 'vue';\n";

runCases('no-unowned-async-assertion hosts it follows and hosts it ignores', {
  valid: [
    "declare function cb(): void; it('x', () => { setTimeout(cb); });",
    "declare function gc(): void; it('x', () => { gc(); });",
    `${HTTP}it('x', async () => { http.createServer((req, res) => { expect(req.url).toBe('/'); res.end(); }); await fetch(url); });`,
    "import https from 'node:https'; it('x', async () => { https.createServer((req) => { expect(req.url).toBe('/'); }); await fetch(url); });",
    "import http2 from 'node:http2'; it('x', () => { http2.createSecureServer((req) => { expect(req.url).toBe('/'); }); client.request(); });",
    "import net from 'node:net'; it('x', () => { net.createServer((s) => { expect(s.remotePort).toBe(1); }); net.connect(port); });",
    "import tls from 'node:tls'; it('x', () => { tls.createServer((s) => { expect(s.authorized).toBe(true); }); connectTo(port); });",
    "import dgram from 'node:dgram'; it('x', () => { dgram.createSocket('udp4', (msg) => { expect(msg).toBe(1); }); send(); });",
    `${FS}it('x', async () => { fs.watch(p, (ev) => expect(ev).toBe('change')); await touch(p); });`,
    `${FS}it('x', async () => { fs.watchFile(p, (cur) => expect(cur.size).toBe(1)); await touch(p); });`,
    `${VUE}it('x', async () => { await nextTick(() => expect(a).toBe(1)); });`,
    `${VUE}it('x', () => { return nextTick(() => expect(a).toBe(1)); });`,
    "it('x', () => { nextTick(() => expect(a).toBe(1)); });",
    "function setTimeout(cb) { cb(); } it('x', () => { setTimeout(() => expect(a).toBe(1)); });",
    "const setImmediate = (cb) => cb(); it('x', () => { setImmediate(() => expect(a).toBe(1)); });",
    "it('x', () => { const queueMicrotask = (cb) => cb(); queueMicrotask(() => expect(a).toBe(1)); });",
    "it('x', ({ requestAnimationFrame }) => { requestAnimationFrame(() => expect(a).toBe(1)); });",
    "import { setTimeout } from 'node:timers/promises'; it('x', () => { setTimeout(() => expect(a).toBe(1)); });",
    `${RX}it('x', () => { of(1).subscribe((v) => expect(v).toBe(1)); });`,
    `${RX}it('x', () => { EMPTY.subscribe({ complete: () => expect(a).toBe(1) }); });`,
    "it('x', () => { service.items$.subscribe((items) => expect(items).toEqual([])); });",
    `${RX}it('x', () => { testScheduler.run(() => { interval(10).subscribe((v) => expect(v).toBe(0)); }); });`,
    `${RX}it('x', () => { scheduler.run(({ cold }) => { cold('a').pipe(delay(5)).subscribe((v) => expect(v).toBe('a')); }); });`,
  ],
  invalid: [
    [
      "declare function gc(): void; it('x', () => { setTimeout(() => expect(1).toBe(1)); gc(); });",
      'timer',
      'setTimeout',
    ],
    [
      `${HTTP}it('x', () => { http.createServer((req) => { expect(req.url).toBe('/'); }); });`,
      'listener',
      'createServer',
    ],
    [
      `${FS}it('x', () => { fs.watch(p, (ev) => expect(ev).toBe('change')); });`,
      'listener',
      'watch',
    ],
    [
      `${HTTP}it('x', () => { http.get(url, (res) => { expect(res.statusCode).toBe(200); }); });`,
      'callback',
      'get',
    ],
    [
      "import { nextTick } from 'node:process'; it('x', () => { nextTick(() => expect(a).toBe(1)); });",
      'microtask',
      'nextTick',
    ],
    [
      "import process from 'node:process'; it('x', () => { process.nextTick(() => expect(a).toBe(1)); });",
      'microtask',
      'nextTick',
    ],
    ["it('x', () => { setTimeout(() => expect(a).toBe(1)); });", 'timer', 'setTimeout'],
    [
      `${RX}it('x', () => { interval(10).subscribe((v) => expect(v).toBe(0)); });`,
      'listener',
      'subscribe',
    ],
    [
      `${RX}it('x', () => { source$.pipe(delay(5)).subscribe((v) => expect(v).toBe(1)); });`,
      'listener',
      'subscribe',
    ],
    [
      "it('outer', () => { it('inner', () => { setTimeout(() => expect(a).toBe(1)); }); });",
      'timer',
      'setTimeout',
    ],
  ],
});
