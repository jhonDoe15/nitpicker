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
const worded = (build, body, message) => ({ ...build(body), errors: [{ message }] });
const ROUTE =
  ' An exception fits only when the task owns the resource or the resource lives as long as the process.';
const AWAIT =
  'await the task before the block ends (await Promise.all([...]) for several), or open and close the resource inside the task';
const texts = {
  detached: `This task is detached with void, but the using declaration disposes db when the block ends, so the task can run on a closed resource. ${AWAIT}.${ROUTE}`,
  deferred: `This timer or microtask runs after the block ends, but the finally block has disposed db by then. Resolve a promise from the callback and await it inside the block, or open and close the resource inside the callback.${ROUTE}`,
  unawaited: `This promise is never awaited, but the using declaration disposes db when the block ends, so the task can run on a closed resource. ${AWAIT}.${ROUTE}`,
  returned: `This returns the promise without awaiting it, so the finally block disposes db before the task finishes. Write return await ..., or ${AWAIT}.${ROUTE}`,
};

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
    using('await new Promise((resolve) => setTimeout(() => { db.query(); resolve(); }, 10));'),
    closed('return await new Promise((resolve) => setTimeout(() => resolve(db.query()), 10));'),
    using('function later() { return db.query(); } return await later();'),
    closed('await run(db);'),
    closed('return db.query();'),
    using('db.query().then(() => audit());'),
    {
      filename,
      code: 'async function f(db) { try { void run(db); } finally { await db?.close(); } }',
    },
    {
      filename,
      code: 'async function f(db) { try { void run(db); } finally { if (db) { await db.close(); } } }',
    },
    {
      filename,
      code: 'async function f(db) { const alias = db; try { void run(alias); } finally { await db.close(); } }',
    },
    closed('void audit();'),
    { filename, code: 'async function f() { const db = open(); void run(db); }' },
    { filename, code: 'async function f(db) { try { void run(db); } finally { db.flush(); } }' },
    {
      filename,
      code: 'async function f() { using db = open(); const inner = async () => { await run(db); }; await inner(); }',
    },
  ],
  invalid: [
    worded(using, 'void run(db);', texts.detached),
    invalid(using, 'void (async () => { await db.query(); })();', 'detached'),
    invalid(using, 'void Promise.all([run(db), run(db)]);', 'detached'),
    invalid(closed, 'void run(db);', 'detached'),
    invalid(using, 'setTimeout(() => db.query(), 10);', 'deferred'),
    invalid(using, 'queueMicrotask(() => db.query());', 'deferred'),
    invalid(using, 'process.nextTick(() => db.query());', 'deferred'),
    invalid(using, 'globalThis.setInterval(function () { db.query(); }, 10);', 'deferred'),
    invalid(using, 'setTimeout(flush, 10, db);', 'deferred'),
    worded(closed, 'setTimeout(() => db.query(), 10);', texts.deferred),
    invalid(
      using,
      'const later = new Promise((resolve) => setTimeout(() => resolve(db.query()), 10));',
      'deferred',
    ),
    worded(
      (body) => ({
        filename,
        code: `async function run(d) {} async function f() { await using db = open(); ${body} }`,
      }),
      'const task = run(db);',
      texts.unawaited,
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
    worded(closed, 'return (async () => db.query())();', texts.returned),
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
