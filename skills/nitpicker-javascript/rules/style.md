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
- A condition in its shortest exact form (`nitpicker/shorter-boolean-logic`): `n > 5`, not `n > 3 && n > 5`;
  `a`, not `(a && b) || (a && !b)`; `x >= 0 && x < 20`, not two adjacent ranges joined by `||`.
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
- A Map, Set or array in a class field or factory closure that a method adds per request, session or run to is
  removed from when that ends (`finally`, close), bounded by a `size` check, or a `WeakMap`
  (`nitpicker/no-add-only-collection`).
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
- Change or delete many rows with one statement (`update(criteria, values)`, `updateMany`, `delete(criteria)`,
  `deleteMany`, `nativeUpdate`), not by loading them, assigning a constant to each and saving them back
  (`nitpicker/no-loaded-rows-saved-back`).
- Select the one column you read (`select: { email: true }`) and test existence with `exists`/`existsBy`
  (TypeORM) or `findFirst({ where, select: { id: true } })` (Prisma), not by loading whole rows or counting
  (`nitpicker/no-whole-rows-for-one-value`).
- Index every foreign key in the migration that adds it (`CREATE INDEX ON orders (customer_id)`, or an index
  that starts with the column) and give Prisma relations an `@@index([authorId])`: PostgreSQL does not create
  one (`foreign-key-index`).
- Join at most one to-many relation into a query: TypeORM `relationLoadStrategy: 'query'` or a query
  per collection, Sequelize `separate: true` on the other `hasMany` includes, and
  `strategy: 'select-in'` on a MikroORM `populate` (`nitpicker/no-multiple-collection-joins`).
- Index every foreign key: `@Index()` on a TypeORM `@ManyToOne` (or a class `@Index` that starts with it),
  `index: true` on a MikroORM `@ManyToOne`, `index().on(t.orderId)` in a Drizzle `pgTable`
  (`nitpicker/no-unindexed-foreign-key`; with migrations, a `CREATE INDEX` there, `foreign-key-index`).
- Give every field written from a request a validation bound at or below its column width (`z.string().max(30)`,
  `@MaxLength(30)` for `varchar(30)`), and keep the OpenAPI `maxLength`, `minLength` and `pattern` equal to the
  validation of the same property (`field-limit-mismatch`). A column wider than the validation is fine.
- Pick the cheaper collection form: a `Set` (`add`, `has`) for items you search while you collect
  them, a `Map` built once before a loop or handler instead of `find((x) => x.key === key)` in it,
  and one `reduce` pass instead of `sort(...)[0]` or `toSorted(...).at(-1)`
  (`nitpicker/no-costly-collection-form`).
- Rows read with `for await` (any source that is not an array) are handled as they arrive: flush
  a fixed-size batch inside the loop and the rest after it, never one array of every row
  (`nitpicker/no-collected-stream-rows`).
- Never run a query or a request once per item of a loop: fetch or write the items in one query
  (`findByIds`, `createMany`, `WHERE id IN (...)`), also when a helper of yours does the I/O and inside
  `Promise.all(items.map(...))`. For a remote API without a batch endpoint use a limiter or fixed-size
  chunks. Paging loops, retries, a call that takes a whole chunk and broker publishes pass
  (`nitpicker/no-io-in-loop`).
- Don't copy an accumulator array with `concat` on every step of `reduce` or a loop: push into an array
  created before the loop, or build the result with `flatMap` (`nitpicker/no-accumulator-concat`).
- Load a lazy TypeORM relation with the query that reads the items (`relations: { customer: true }` or
  `leftJoinAndSelect`), never with `await item.customer` once per item (`nitpicker/no-lazy-relation-in-loop`).
- Keep a remote call out of a transaction and out of a lock: call before the transaction starts or after it
  commits (and outside the lock), and keep only the shared-state change under the lock
  (`nitpicker/no-remote-call-in-transaction`, `nitpicker/no-remote-call-under-lock`).
- A retried write carries one key for all attempts: a Stripe `idempotencyKey`, a `MessageDeduplicationId`,
  `jobId` or `msgID`, `ON CONFLICT` on an insert, or retry only the read
  (`nitpicker/no-retry-without-idempotency`).
- Don't write to the database and publish a message in one function: write an outbox row in the same
  transaction and let a relay publish it (`nitpicker/no-dual-write`).
- Don't look a row up per element in an RxJS pipeline (`from(ids).pipe(mergeMap((id) => load(id)))`): fetch all
  the rows in one batched query and join them in memory (`nitpicker/no-lookup-per-element`).
- Resolve a GraphQL field of a listed type through a DataLoader (`loaders.owner.load(parent.ownerId)`), never with
  a repository or service call per parent (`nitpicker/no-query-per-parent`).
- Retry an optimistic-lock conflict by re-reading the row by id and re-applying the change inside the retried
  scope, never by saving the entity you loaded before the retry (`nitpicker/no-stale-retry-after-conflict`).
- Write related rows in one transaction and write through the transaction's own manager, never a repository
  injected from outside (`nitpicker/no-unatomic-writes`); decide a write from a read inside the transaction with a
  row lock, or with an atomic `upsert` or `update ... where version = ?` (`nitpicker/no-check-then-write`).
- In a scheduled or queue job, isolate each item of a loop: `try`/`catch` and record the failure per item, queue
  one job per item, or `Promise.allSettled` and report the failures, so one bad item does not skip the rest
  (`nitpicker/no-unisolated-job-loop`).
- Apply the soft-delete or visibility filter the rest of the project applies to a table (`deletedAt IS NULL`, the
  `withDefaultVisibility` helper) to every new read or join of it; a trash or admin query that reads those rows on
  purpose takes the exception (`nitpicker/no-unfiltered-soft-delete-read`).
- Skip deleted items the way the project does in every new loop, `find` or `filter` over a collection that carries
  `isDeleted` (a guard, a helper such as `getNonDeletedElements`, or the narrowed type `NonDeleted<T>`); undo and
  restore code that reads them on purpose takes the exception (`nitpicker/no-unguarded-deleted-items`).
- Declare the auth requirement on every new route the way the project's other routes do (`@Authenticated({ permission })`,
  the guard decorator, the auth middleware), or mark it public with the project's marker
  (`nitpicker/no-route-without-auth`).
- Take one collection step where one does: `find(p)` not `filter(p)[0]`, `some(p)` not a tested
  `find(p)`, `flatMap(f)` not `map(f).flat()`, no spread copy of an array that is already new or
  into `new Set`/`Promise.all`, `{ ...options }` not `{ ...(options || {}) }`, no length check
  before `some`/`every`, `[await one]` not `Promise.all([one])`, and no `await` inside
  `Promise.all([...])` (`nitpicker/no-wasted-collection-step`).
- Compare HTTP text case-insensitively and parse structured headers: lowercase a header value, media
  type, charset, scheme, cookie name or file extension (`value.toLowerCase()`) before comparing it, and
  parse `Accept*`, `Content-Type`, `Cache-Control`, `If-None-Match` and `Cookie` with the `content-type`,
  `negotiator`, `accepts` or `cookie` package or the framework's own helper instead of `split(',')` or
  `split(';')` (`nitpicker/no-raw-http-value`). Header names read with `Headers.get`, `req.header` or
  `req.get` ignore case already; a library that is itself the parser takes an exception.
- Name files, folders and types for what they do (`price-rounding.ts`, `PriceRounder`), never
  `utils`, `helpers`, `common`, `misc` or `*Manager`; pure logic shared between features goes in the
  shared folder under such a name (`nitpicker/no-generic-name`).
- A string of five characters or more used three times in a file is named once as a constant
  (`nitpicker/no-repeated-string-literal`).
- Secrets come from the environment or a secrets manager, never from a literal given to `password`, `token`,
  `apiKey` and the like (`nitpicker/no-hardcoded-secret`), and a log call or error message says a secret is
  set or shows a masked tail, never the value (`nitpicker/no-secret-in-log`).
- Base64 of text goes through UTF-8 bytes (`Buffer.from(text, 'utf8').toString('base64')` or `TextEncoder` with a
  bytes-to-base64 step), because `btoa` throws for any character above U+00FF (`nitpicker/no-btoa-on-runtime-text`).
- A header value made from a path, route, user name, request data or JSON is encoded first (`encodeURIComponent`, base64),
  because headers throw for characters above U+00FF (`nitpicker/no-non-latin1-header-value`).
- Bytes that are parsed, compared or written back are decoded with `new TextDecoder('utf-8', { fatal: true })`, not with a
  lenient decoder or a `'utf8'` read written to the same file, which turn invalid bytes into U+FFFD
  (`nitpicker/no-lossy-utf8-decode`).
- A limit stated in bytes is checked on bytes: `Buffer.byteLength(text, 'utf8')` or the length of the `TextEncoder` output,
  not `text.length`, and chunks are cut from the encoded bytes (`nitpicker/no-string-length-as-byte-count`).
- Escaping for another syntax covers the escape character too: one regex with a callback over the backslash and the quote
  (`value.replace(/[\\"]/g, (c) => '\\' + c)`), or `JSON.stringify`, and unescaping is one pass with a callback
  (`nitpicker/no-incomplete-escaping`).
- Generated source code writes a value as `JSON.stringify(value)`, not between hand-written quotes
  (`nitpicker/no-hand-quoted-generated-code`).
- Text received from a socket or an HTTP response is passed through `util.stripVTControlCharacters` (or `strip-ansi`) before it is
  printed to the terminal (`nitpicker/no-unstripped-remote-text`).
- A value in a CSS selector goes through `CSS.escape` (`#${CSS.escape(id)}`, `[data-name="${CSS.escape(name)}"]`), not through
  hand-written quote escaping (`nitpicker/no-unescaped-css-selector`).
- A value put into a URL is encoded or set through `URL`: `encodeURIComponent(value)` in a query value or a path segment,
  `url.searchParams.set(name, value)` on `new URL(base)` instead of appending `?name=value` to a base that may carry a query,
  and an encoded user name and password in a connection URL (`nitpicker/no-unencoded-url-part`).
- A dynamic `import()` of a file goes through a file URL: `await import(pathToFileURL(file).href)`, never a path from
  `path.resolve`, `path.join` or `require.resolve`, which fails on Windows drive paths (`nitpicker/no-dynamic-import-of-path`).
- A URL that comes from data (a stored field, a profile, a document) becomes an `href`, an `iframe` `src` or a
  `window.open` target only through one helper that returns it for `http:` and `https:` and nothing else, with plain text
  as the fallback (`nitpicker/no-unchecked-url-sink`).
- File paths and host names compared across sources are compared with case folded: `path.relative(a, b) === ''`, a normalize and
  lowercase helper on win32 and darwin, or `toLowerCase()` on both hosts, never `===` or `startsWith` on plain strings
  (`nitpicker/no-case-sensitive-path-compare`).
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
- A missing value is `undefined`, not falsy: test `count !== undefined`, `name !== undefined`, default with
  `value ?? fallback`, and filter with `(v) => v !== undefined`, never `if (count)`, `name || d` or
  `.filter(Boolean)` on a number, an optional string or an optional boolean (`nitpicker/strict-boolean-expressions`,
  `nitpicker/no-presence-truthiness`, the latter report-only). Once `if (x)` has decided `x`, do not write
  `Boolean(x)` or `!!x` in that branch (`nitpicker/no-decided-condition`).
- Text from an env var, a query parameter or a form field is checked for blankness before `Number(text)`:
  `Number("")` is 0, so `isNaN` alone accepts a blank value; use `if (!text?.trim())`, `Number.parseInt(text, 10)`,
  or a check that rejects 0 (`nitpicker/no-blank-number-coercion`).
- An "all done" or "all cancelled" signal over a list that can be empty checks the list first:
  `tools.length > 0 && tools.every(...)`, because `every` is true for no items
  (`nitpicker/no-empty-every-signal`, report-only).
- An explicit key and a spread of an object that can carry the same key are ordered on purpose: the explicit
  value goes last when it must win (`{ ...data, id: idOrSelector }`, `<Button {...props} disabled={loading} />`),
  and a caller default goes first or is read as `options.mode ?? 'detailed'` (`nitpicker/no-shadowed-spread-key`).
- An option read from an options or config object is defaulted with `??`, not `||`: `options.ipv6Subnet ?? 64`,
  `options.forceObject ?? config.forceObject`, so an explicit `false`, `0` or `''` from the caller stays
  (`nitpicker/no-falsy-default`).
- A cache or lookup decides presence from the key, not from the stored value: `if (!m.has(k)) { m.set(k, make()); }`
  then `m.get(k)!`, and `key in record` or `Object.hasOwn(record, key)` for a record of `unknown` values, because a
  cached `0`, `''`, `false` or `undefined` is a hit (`nitpicker/no-lookup-as-presence`).
- A key that can hold `undefined` is tested by its value, not by `in`: `data.targetUID !== undefined`, never
  `'targetUID' in data` on an optional property, a `Partial<...>` or a `Record<string, T | undefined>`
  (`nitpicker/no-in-presence-check`; `in` stays right for a union discriminant).
- In a server project, text from a search or filter field is trimmed once before it reaches a lookup:
  `req.query.q?.trim()`, a zod `.trim()` schema, or one global middleware that trims every string; a padded
  `" Davis"` finds nothing (`nitpicker/no-untrimmed-request-text`).
