import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as noTaskOutlivingResource } from './no-task-outliving-resource.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/a/adapters/x.ts';
const using = (body) => ({
  filename,
  code: `async function f() { await using db = open(); ${body} }`,
});
const closed = (body) => ({
  filename,
  code: `async function f() { const db = open(); try { ${body} } finally { await db.close(); } }`,
});
const invalid = (build, body, messageId) => ({ ...build(body), errors: [{ messageId }] });

tester.run('no-task-outliving-resource', noTaskOutlivingResource, {
  valid: [
    using('await db.query();'),
    using('await Promise.all([run(db), run(db)]);'),
    using('return await run(db);'),
    using('const rows = await run(db); return rows;'),
    using('const task = run(db); await task;'),
    using('void audit();'),
    using('setTimeout(() => audit(), 10);'),
    using('const task = (async () => { await db.query(); })(); await task;'),
    using('await (async () => { await db.query(); })();'),
    using('const pending = work(db); queue.push(pending);'),
    using('items.forEach((item) => db.insert(item));'),
    using('await new Promise((resolve) => setTimeout(resolve, 10)); await db.query();'),
    using('function later() { return db.query(); } return await later();'),
    closed('await run(db);'),
    closed('void audit();'),
    { filename, code: 'async function f() { const db = open(); void run(db); }' },
    { filename, code: 'async function f(db) { try { void run(db); } finally { db.flush(); } }' },
    {
      filename,
      code: 'async function f() { using db = open(); const inner = async () => { await run(db); }; await inner(); }',
    },
  ],
  invalid: [
    invalid(using, 'void run(db);', 'detached'),
    invalid(using, 'void (async () => { await db.query(); })();', 'detached'),
    invalid(using, 'void Promise.all([run(db), run(db)]);', 'detached'),
    invalid(closed, 'void run(db);', 'detached'),
    invalid(using, 'setTimeout(() => db.query(), 10);', 'deferred'),
    invalid(using, 'queueMicrotask(() => db.query());', 'deferred'),
    invalid(using, 'process.nextTick(() => db.query());', 'deferred'),
    invalid(using, 'globalThis.setInterval(function () { db.query(); }, 10);', 'deferred'),
    invalid(using, 'setTimeout(flush, 10, db);', 'deferred'),
    invalid(closed, 'setTimeout(() => db.query(), 10);', 'deferred'),
    invalid(
      (body) => ({
        filename,
        code: `async function run(d) {} async function f() { await using db = open(); ${body} }`,
      }),
      'const task = run(db);',
      'unawaited',
    ),
    invalid(using, 'const task = (async () => { await db.query(); })();', 'unawaited'),
    invalid(
      (body) => ({
        filename,
        code: `const run = async (d) => {}; async function f() { using db = open(); ${body} }`,
      }),
      'return run(db);',
      'returned',
    ),
    invalid(closed, 'return (async () => db.query())();', 'returned'),
    {
      ...using('void run(db); void run(db);'),
      errors: [{ messageId: 'detached' }, { messageId: 'detached' }],
    },
    {
      filename,
      code: 'function f() { using db = open(); void run(db); }',
      errors: [{ messageId: 'detached' }],
    },
    {
      filename,
      code: 'async function f(db) { try { void run(db); } finally { await db.close(); } }',
      errors: [{ messageId: 'detached' }],
    },
  ],
});
