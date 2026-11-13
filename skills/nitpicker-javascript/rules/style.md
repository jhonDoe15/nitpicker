# Functions, values and modules

Part of the [nitpicker-javascript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `function` declarations for named functions, nested helpers too; arrows only as callbacks, with a block body when
  they return nothing: `(line) => { out.push(line); }`.
- String-literal unions, never an enum; no classes except `Error` subclasses.
- No `any` and no `null` in your own values: read a library's `null` with `regex.exec(s)?.[0]` in
  one expression or a strict `!== null` check. Narrow with checks, and don't add `??`, `?.` or
  checks the types already rule out. Indexing (`list[0]`, `record[key]`) may be `undefined`: check
  the value you got.
- `===` only. Early returns, no `else` after `return`, no nested ternaries, exhaustive `switch`
  over unions, with no `default`.
- Boolean logic in its simplest exact form (`nitpicker/simpler-boolean-logic`): `return a < b;`, not an `if`
  that returns `true` and `false`; one `if (a && b)`, not an `if` that only holds another `if`; `if (c) {B} else {A}`,
  not `if (!c) {A} else {B}` (and `c ? b : a`, not `!c ? a : b`); `a !== b`, not `!(a === b)`; `!(a || b)`,
  not `!a && !b`; a boolean `c` itself, not `c ? true : false` or `!!c`, and `c && x`, `c || x`, `!c && x`,
  `!c || x` for a ternary with one `true`/`false` branch and a boolean other branch.
- `const` or `let`, never `var`. Rest parameters (`...args`) instead of `arguments[i]`, and spread
  instead of `.apply`.
- No method that only passes its parameters, in order, to another method of the same class
  (`total(items) { return this.sum(items); }`): call that method directly (or, when it is less visible, rename it to the alias's name and delete the alias).
- Template literals take strings only: `${String(count)}`.
- Sort IDs, codes and ISO dates with `toSorted()` and no comparator; names and titles with
  `a.localeCompare(b, 'en')`. Objects in plain string order share one `compareText(a, b)` that
  returns -1, 1 or 0 from `<` and `>`, with its own unit test (a sort reads only the sign). Chain
  keys on its result: `const byMonth = compareText(a.month, b.month); if (byMonth !== 0) return byMonth;`.
- `for...of` is the only loop, and no recursion: a retry is `for...of` over attempt numbers.
- Up to 3 parameters stay positional. Past 3, group related values into one object. A factory's
  inner functions count toward its 50 lines: put helpers at module level and pass `deps` in.
- Remove a parameter the body does not read. One that a callback or override signature requires
  starts with `_` (`_event`).
- `async`/`await`, never `.then()`. No floating promises.
  Await every task that uses a `using` or `finally`-closed resource before its block ends (no `void` call,
  timer callback or un-awaited async call on it): `nitpicker/no-task-outliving-resource`.
- A close, dispose, stop or `afterAll` function releases every resource even when one release fails:
  `Promise.allSettled` over the releases, then rethrow the first failure, or `try { ... } finally { reset }`;
  never `await a.close(); await b.close();` or `Promise.all` of releases
  (`nitpicker/no-cleanup-skipped-on-failure`).
- A close function that clears a map of pending callbacks or resolve/reject pairs rejects every entry first
  (`for (const entry of pending.values()) entry.reject(new Error('closed'));`), so no caller waits forever
  (`nitpicker/settle-pending-on-close`).
- A scope with a close function releases what it registers: keep the handler and call `off` on the emitter, or
  register with `once` or a `{ signal }` that close aborts, and keep each `setInterval` or retry `setTimeout`
  handle to `clearInterval` or `clearTimeout` it in close (`nitpicker/release-listeners-on-close`).
- A promise kept in a field or variable and returned on later calls is cleared when it rejects, and only while it
  still holds that attempt: `catch (error) { if (conn === attempt) { conn = undefined; } throw error; }`
  (`nitpicker/no-cached-rejection`).
- A timeout does not stop the work it races: `Promise.race([op(), rejectAfter(ms)])` leaves `op` running
  (`timeout-abandons-operation`). Give `op` the `AbortSignal` the timeout aborts (`{ signal: controller.signal }`,
  or `AbortSignal.timeout(ms)` straight to an API that takes `signal`) and drop the race.
- Do not update shared state from a value read before an `await` (`state.total += await load()`):
  await into a local first (`const delta = await load(); state.total += delta;`), then read and
  write the shared state with no `await` between them. A lock or queue is not recognized; state
  that is already serialized takes a reviewed exception (`nitpicker/require-atomic-updates`).
- In an `async` function or a request handler, use the promise APIs (`readFile` from
  `node:fs/promises`, `access` or `stat` instead of `existsSync`, `promisify(execFile)`,
  `promisify(pbkdf2)`), never `readFileSync`, `execSync`, `pbkdf2Sync` and the other `*Sync` calls of
  `fs`, `child_process`, `crypto` and `zlib`: they block the event loop for every other request
  (`nitpicker/no-sync-node-api-in-async`, entry points included). Module top level, a worker thread
  and a CLI `main` that is only called from startup code stay synchronous.
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. RxJS: `mergeMap(fn, 8)` or `concatMap`, never `forkJoin(items.map(load))`. Never `Promise.all(items.map(send))` over a runtime collection.
- A `new Promise` that waits on a listener, a stream or a callback takes `reject` and wires the
  failure to it: `new Promise((resolve, reject) => { source.once('error', reject); ... })`, and a
  node-style callback branches first: `if (error) { reject(error); return; }`. Better, use a form
  that rejects by itself: `once` from `node:events`, `pipeline`/`finished` from
  `node:stream/promises`, or `util.promisify` (`nitpicker/require-promise-reject`). A wait on a
  socket or network stream also gets a deadline: a timer that rejects or `AbortSignal.timeout(ms)`.
- Let the database count, filter, sort and aggregate: `count`/`exists`/`findFirst` instead of
  `(await repo.find()).length`, `where` instead of `.filter`/`.some`/`.find` on the rows, `order`/`orderBy`
  instead of `.sort`, and the ORM's aggregate or `groupBy` instead of `reduce` or `groupBy` over the rows
  (`nitpicker/no-in-memory-query`).
- Index every foreign key in the migration that adds it (`CREATE INDEX ON orders (customer_id)`, or an index
  that starts with the column) and give Prisma relations an `@@index([authorId])`: PostgreSQL does not create
  one (`foreign-key-index`).
- Join at most one to-many relation into a query: TypeORM `relationLoadStrategy: 'query'` or a query
  per collection, Sequelize `separate: true` on the other `hasMany` includes, and
  `strategy: 'select-in'` on a MikroORM `populate` (`nitpicker/no-multiple-collection-joins`).
- Index every foreign key: `@Index()` on a TypeORM `@ManyToOne` (or a class `@Index` that starts with it),
  `index: true` on a MikroORM `@ManyToOne`, `index().on(t.orderId)` in a Drizzle `pgTable`
  (`nitpicker/no-unindexed-foreign-key`; with migrations, a `CREATE INDEX` there, `foreign-key-index`).
- Pick the cheaper collection form: a `Set` (`add`, `has`) for items you search while you collect
  them, a `Map` built once before a loop or handler instead of `find((x) => x.key === key)` in it,
  and one `reduce` pass instead of `sort(...)[0]` or `toSorted(...).at(-1)`
  (`nitpicker/no-costly-collection-form`).
- Rows read with `for await` (any source that is not an array) are handled as they arrive: flush
  a fixed-size batch inside the loop and the rest after it, never one array of every row
  (`nitpicker/no-collected-stream-rows`).
- Name files, folders and types for what they do (`price-rounding.ts`, `PriceRounder`), never
  `utils`, `helpers`, `common`, `misc` or `*Manager`; pure logic shared between features goes in the
  shared folder under such a name (`nitpicker/no-generic-name`).
- A string of five characters or more used three times in a file is named once as a constant
  (`nitpicker/no-repeated-string-literal`).
- Secrets come from the environment or a secrets manager, never from a literal given to `password`, `token`,
  `apiKey` and the like (`nitpicker/no-hardcoded-secret`), and a log call or error message says a secret is
  set or shows a masked tail, never the value (`nitpicker/no-secret-in-log`).
- A child process you wait for gets a deadline: `{ timeout: 30_000 }` on `execFileSync`/`spawnSync`, or a
  `timeout` or `signal: AbortSignal.timeout(30_000)` on `execFile` and an awaited `spawn` or `execa`
  (`nitpicker/require-process-timeout`; a build wrapper that only runs a child to completion takes an exception).
- Time values carry their unit in the name (`timeoutMs`, `ttlSeconds`) and meet only the same unit: convert
  once where a value enters (`ttlSeconds * 1000`, `Math.floor(Date.now() / 1000)`), compare JWT `exp` with
  `Date.now() / 1000`, pass milliseconds to `setTimeout` and `new Date(...)`, and never cut an epoch time
  with `| 0` (`nitpicker/time-unit-mismatch`).
- A database or AWS SDK client gets a timeout once, where it is built:
  `new Pool({ statement_timeout: 30_000 })`, `extra: { statement_timeout: 30_000 }` on a TypeORM data source,
  `requestHandler: { requestTimeout: 30_000, throwOnRequestTimeout: true }` on an AWS SDK client
  (`nitpicker/require-client-timeout`).
- Named exports only (`export function`, `export { x } from`); no `export default`. No comments;
  JSDoc type tags are the exception.
- Signatures: an exported function or public method does not branch on a `{boolean}` parameter
  (`nitpicker/no-boolean-flag-parameter`): write two functions or take an options object. A value
  with three states is a union of string literals, not `{boolean|undefined}`,
  `{boolean=}` or a `@param {boolean} [force]` with no default (the type-aware rules read your
  JSDoc types, so write them); default only `undefined` with `??`, never `||` on an optional parameter that can be `0`, `''` or
  `false`; return a
  new array, `Set`, `Map` or object instead of changing a parameter (`[...items, item]`,
  `items.toSorted()`). When code moves, change every caller and delete the old name: no
  `@deprecated` declaration and no `export const Old = New` alias.
- CommonJS is allowed: `require()` of a module, and `module.exports = { f }`, `module.exports.f = f`
  or `exports.f = f`. In `domain/`,
  destructure a `require`: `const { basename } = require('node:path');`, not
  `const path = require('node:path');`.
- In a server project, dates use UTC or a named zone, never the server's own: `getUTCHours()`,
  `toISOString()`, `Date.UTC(...)`, `{ timeZone }` for `Intl.DateTimeFormat` and `toLocale*String`,
  luxon `{ zone }`, date-fns `{ in: tz(zone) }`, dayjs `.utc()` (`nitpicker/no-local-time-zone`).
- In a server project, a number, boolean or date read from the query string, path, headers or a
  form is converted in its schema, since the value arrives as text: `z.coerce.number()`, `z.stringbool()`,
  valibot `v.pipe(v.string(), v.toNumber(), v.number())`. Never `z.coerce.boolean()`: it turns `"false"`
  into true (`nitpicker/no-uncoerced-request-input`).
