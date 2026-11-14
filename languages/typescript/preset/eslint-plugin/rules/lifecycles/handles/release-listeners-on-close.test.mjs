import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './release-listeners-on-close.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/a/adapters/x.ts';
const inClass = (body) => ({ filename, code: `class Client { ${body} }` });
const factory = (body) => ({ filename, code: `function createClient() { ${body} }` });
const bad = (build, body, messageId) => ({ ...build(body), errors: [{ messageId }] });

const LISTEN = 'start() { this.socket.on("data", this.onData); }';

tester.run('release-listeners-on-close', rule, {
  valid: [
    inClass('start() { process.on("SIGTERM", this.h); } close() {}'),
    inClass('start() { this.t = setInterval(() => {}, 1); } close() { clearInterval(this.t!); }'),
    inClass(
      'start() { this.t = setInterval(() => {}, 1); } close() { window.clearInterval(this.t); }',
    ),
    inClass(
      'start() { this.t = setInterval(() => {}, 1); } close() { const t = this.t; clearInterval(t); }',
    ),
    inClass(
      'start() { this.ee.on("x", this.h); } close() { const ee = this.ee; ee.removeAllListeners(); }',
    ),
    inClass(`${LISTEN} close() { this.socket.off("data", this.onData); }`),
    inClass(`${LISTEN} close() { this.socket.removeAllListeners(); }`),
    inClass(`${LISTEN} close() { this.socket.destroy(); }`),
    inClass('start() { this.socket.once("data", this.onData); } close() {}'),
    inClass('start() { this.socket.on("data", this.onData, { once: true }); } close() {}'),
    inClass('start(signal) { this.socket.addEventListener("x", this.h, { signal }); } close() {}'),
    inClass('start() { const socket = open(); socket.on("data", this.onData); } close() {}'),
    inClass(LISTEN),
    inClass('constructor() { this.socket.on("data", this.onData); } close() {}'),
    factory('const child = spawn(); child.on("error", fail); function stop() {} return { stop };'),
    inClass(
      'start() { this.timer = setInterval(() => this.tick(), 10); } close() { clearInterval(this.timer); }',
    ),
    inClass('wait() { return new Promise((resolve) => setTimeout(resolve, 10)); } close() {}'),
    inClass('run() { const t = setTimeout(() => {}, 10); } close() {}'),
    inClass('start() { const t = setInterval(() => {}, 10); clearInterval(t); } close() {}'),
    inClass('start() { setInterval(() => {}, 10); }'),
    factory(
      'let timer; function start() { timer = setTimeout(() => {}, 10); } function stop() { clearTimeout(timer); } return { start, stop };',
    ),
    factory(
      'const emitter = make(); function start() { emitter.on("x", handle); } function close() { emitter.off("x", handle); } return { start, close };',
    ),
    {
      filename: '/repo/src/main/composition/root.ts',
      code: 'process.on("SIGTERM", () => {}); class A { close() {} }',
    },
  ],
  invalid: [
    bad(inClass, `${LISTEN} close() { this.stopped = true; }`, 'listener'),
    bad(inClass, 'start() { this.socket.addEventListener("x", this.h); } close() {}', 'listener'),
    bad(
      inClass,
      'start() { this.timer = setInterval(() => this.tick(), 10); } close() {}',
      'timer',
    ),
    bad(inClass, 'start() { this.retry = setTimeout(() => this.go(), 10); } stop() {}', 'timer'),
    bad(inClass, 'start() { setInterval(() => this.tick(), 10); } close() {}', 'timer'),
    bad(inClass, 'start() { const t = setInterval(() => this.tick(), 10); } close() {}', 'timer'),
    bad(
      factory,
      'const emitter = make(); function start() { emitter.on("x", handle); } function close() {} return { start, close };',
      'listener',
    ),
    bad(
      factory,
      'let timer; function start() { timer = setInterval(() => {}, 10); } function close() {} return { start, close };',
      'timer',
    ),
  ],
});
