import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-cleanup-skipped-on-failure.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/a/adapters/x.ts';
const inClass = (body, name = 'close') => ({
  filename,
  code: `class Client { async ${name}() { ${body} } }`,
});
const invalid = (build, body, errors) => ({ ...build(body), errors });
const ROUTE = ' An exception fits only when a failed release should abort the remaining ones.';

tester.run('no-cleanup-skipped-on-failure', rule, {
  valid: [
    inClass('await this.producer.disconnect();'),
    inClass('try { await this.producer.disconnect(); } finally { this.producer = undefined; }'),
    inClass(
      'const results = await Promise.allSettled([this.a.close(), this.b.close()]); for (const r of results) { if (r.status === "rejected") { throw r.reason; } }',
    ),
    inClass('await Promise.allSettled([this.a.close(), this.b.close()]);'),
    inClass('try { await this.a.close(); } catch (error) { log(error); } await this.b.close();'),
    inClass('await this.a.close(); this.log("done");'),
    inClass('this.a.log(); this.b.log();'),
    inClass('await Promise.all([this.a.close()]);'),
    inClass('await Promise.all(this.items.map((item) => item.load()));'),
    inClass('await this.a.close(); this.b.close();', 'load'),
    inClass('await this.a.close(); await this.b.close();', 'start'),
    inClass('const stop = async () => { await this.a.close(); }; await stop();'),
    {
      filename,
      code: 'afterAll(async () => { try { await a.close(); } finally { await b.close(); } });',
    },
    {
      filename,
      code: 'process.on("message", async () => { await a.close(); await b.close(); });',
    },
  ],
  invalid: [
    invalid(inClass, 'this.a.close(); this.b.end();', [{ messageId: 'sequential' }]),
    invalid(inClass, 'if (this.a) await this.a.close(); if (this.b) await this.b.close();', [
      { messageId: 'sequential' },
    ]),
    invalid(inClass, 'for (const item of this.items) { await item.close(); } this.items = [];', [
      { messageId: 'sequential' },
    ]),
    invalid(inClass, 'await this.a.close(); return this.b.close();', [{ messageId: 'sequential' }]),
    invalid(
      (body) => ({ filename, code: `app.addHook('onClose', async () => { ${body} });` }),
      'await a.close(); await b.close();',
      [{ messageId: 'sequential' }],
    ),
    {
      ...inClass(
        'await this.producer.disconnect(); await this.consumer.disconnect(); this.client = undefined; this.x = null; this.y = null;',
      ),
      errors: [
        {
          message: `this.producer.disconnect() can reject, so this.consumer.disconnect(), this.client, this.x and 1 more never run. Release with Promise.allSettled and rethrow the first failure, or reset state in try { ... } finally { ... }.${ROUTE}`,
        },
      ],
    },
    invalid(inClass, 'await this.a.close(); await this.b.close();', [{ messageId: 'sequential' }]),
    invalid(inClass, 'await this.a.close(); this.client = null;', [{ messageId: 'sequential' }]),
    invalid(inClass, 'await this.a?.close(); this.items.clear();', [{ messageId: 'sequential' }]),
    invalid(
      (body) => inClass(body, 'onModuleDestroy'),
      'await this.a.close(); await this.b.quit();',
      [{ messageId: 'sequential' }],
    ),
    invalid(
      (body) => inClass(body, 'shutdown'),
      'try { await a.close(); await b.destroy(); } finally { done(); }',
      [{ messageId: 'sequential' }],
    ),
    invalid(inClass, 'await Promise.all([this.a.close(), this.b.close()]);', [
      { messageId: 'parallel' },
    ]),
    invalid(inClass, 'await Promise.all(this.items.map((item) => item.close()));', [
      { messageId: 'parallel' },
    ]),
    invalid(inClass, 'await Promise.all(this.items.map(async (i) => { return i.stop(); }));', [
      { messageId: 'parallel' },
    ]),
    {
      filename,
      code: 'afterAll(async () => { await server.close(); await db.end(); });',
      errors: [{ messageId: 'sequential' }],
    },
    {
      filename,
      code: 'afterEach(async function () { await Promise.all([a.close(), b.close()]); });',
      errors: [{ messageId: 'parallel' }],
    },
    {
      filename,
      code: 'process.on("SIGTERM", async () => { await app.close(); await db.disconnect(); });',
      errors: [{ messageId: 'sequential' }],
    },
    {
      filename,
      code: 'export function createServer() { return { async close() { await a.close(); await b.close(); } }; }',
      errors: [{ messageId: 'sequential' }],
    },
    {
      filename,
      code: 'const dispose = async () => { await a.close(); await b.close(); };',
      errors: [{ messageId: 'sequential' }],
    },
  ],
});
