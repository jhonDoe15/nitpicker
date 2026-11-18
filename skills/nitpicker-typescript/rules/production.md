# Async code, I/O and production rules

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

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
- A method that runs once per event or item does not add to the owner's disposable store
  (`this._register(...)`, `this._store.add(...)`) or to `process.on(...)`: register once in the constructor or keep
  a per-call handle that is released when the work ends (`nitpicker/no-per-call-registration`).
- A `setTimeout` that rejects or aborts a promise keeps its handle and clears it when the promise settles
  (`.finally(() => clearTimeout(timer))`), and a timer started in an event handler of a component or a disposable
  class keeps its id and clears it on unmount or dispose (`nitpicker/no-uncleared-timeout`).
- Create a `debounce` or `throttle` function once (a class field, module scope, `useMemo` or `useRef`), never per
  call or per render: a new one each time has its own timer, so nothing is debounced
  (`nitpicker/no-per-call-debounce`).
- A teardown that deletes a registry entry by key first checks that the entry is still its own registration:
  `if (map.get(key) === value) { map.delete(key); }`, because a newer registration may have reused the key
  (`nitpicker/no-unguarded-registry-delete`).
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
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. RxJS: `mergeMap(fn, 8)` or `concatMap`, never `forkJoin(items.map(load))`. Never `Promise.all(items.map(send))` over a runtime collection.
- Wire clients, servers, pools and config in the composition root (`src/main/composition-root.ts`,
  `main.ts` or `server.ts`) and pass them into factories; read `process.env` only there.
- Print through a `{ write(text: string): void }` parameter. Only the composition root
  (or a `layout.entryPoints` file) names `process.stdout` / `process.stderr` and passes them in;
  `console.*` is a finding everywhere.
- Parse untrusted input once with zod in `adapters/`; `domain/` takes readonly types it declares.
- Run programs with `execFile(command, [args])`, never a command string.
- In an `async` function or a request handler, use the promise APIs (`readFile` from
  `node:fs/promises`, `access` or `stat` instead of `existsSync`, `promisify(execFile)`,
  `promisify(pbkdf2)`), never `readFileSync`, `execSync`, `pbkdf2Sync` and the other `*Sync` calls of
  `fs`, `child_process`, `crypto` and `zlib`: they block the event loop for every other request
  (`nitpicker/no-sync-node-api-in-async`, entry points included). Module top level, a worker thread
  and a CLI `main` that is only called from startup code stay synchronous.
- Parse a URL from runtime text with `URL.parse(text)` or after `URL.canParse(text)`; `new URL(text)`
  throws on text that is not a URL (`nitpicker/no-unhandled-url-parse`).
- Build an `Intl` formatter or an `Ajv` instance with fixed options once, at module scope or in a
  class field, not per call (`nitpicker/reusable-object-per-call`).
- Test an environment variable for a value, not only for `undefined`: `if (!process.env.API_URL)`,
  `process.env.PORT || '3000'`, or a schema with `z.string().min(1)`. `API_URL=` gives `''`, which passes
  `!== undefined`, `in` and `??` (`nitpicker/no-undefined-only-env-check`).
- Regexes: a `g` or `y` regex keeps `lastIndex`, so don't reuse one with `test()` or `exec()`
  across calls; drop the flag or use `text.matchAll(pattern)` (`nitpicker/no-shared-stateful-regex`).
  `match`, `matchAll` and `search` compile a string argument as a regex: use `includes` or
  `startsWith` for text, and escape a parameter before building it into `new RegExp(...)`
  (`nitpicker/no-string-as-regex`).
  A pattern part that never changes the match or does not do what it looks like (an assertion that
  always accepts, a duplicate alternative, `[\w_]`, an empty group) is a `regexp/` finding: remove it
  or fix what was meant; a form with a shorter equivalent (`a{1}`, `(?:ab)c`, `[a]`) takes the
  shorter one.
- A `new Promise` that waits on a listener, a stream or a callback takes `reject` and wires the
  failure to it: `new Promise((resolve, reject) => { source.once('error', reject); ... })`, and a
  node-style callback branches first: `if (error) { reject(error); return; }`. Better, use a form
  that rejects by itself: `once` from `node:events`, `pipeline`/`finished` from
  `node:stream/promises`, or `util.promisify` (`nitpicker/require-promise-reject`). A wait on a
  socket or network stream also gets a deadline: a timer that rejects or `AbortSignal.timeout(ms)`.
- A child process you wait for gets a deadline: `{ timeout: 30_000 }` on `execFileSync`/`spawnSync`, or a
  `timeout` or `signal: AbortSignal.timeout(30_000)` on `execFile` and an awaited `spawn` or `execa`
  (`nitpicker/require-process-timeout`; a build wrapper that only runs a child to completion takes an exception).
- A page of rows has an order: `limit`/`offset`/`take`/`skip`, a Prisma `cursor` or SQL `LIMIT` comes with
  `orderBy` on a unique key (or a tie-breaker after a non-unique one), and `json_agg`/`array_agg` or
  Kysely `jsonArrayFrom` lists sort inside (`json_agg(t ORDER BY t.name)`) (`nitpicker/no-unordered-query`).
- A runtime array in an SQL `in` list or a multi-row insert gets an empty check and a size bound: return early when
  it is empty, then send it as one parameter (`= any($1::uuid[])`) or split it with the project's chunking
  helper (`nitpicker/no-unbounded-query-array`).
- Time values carry their unit in the name (`timeoutMs`, `ttlSeconds`) and meet only the same unit: convert
  once where a value enters (`ttlSeconds * 1000`, `Math.floor(Date.now() / 1000)`), compare JWT `exp` with
  `Date.now() / 1000`, pass milliseconds to `setTimeout` and `new Date(...)`, and never cut an epoch time
  with `| 0` (`nitpicker/time-unit-mismatch`).
- A database or AWS SDK client gets a timeout once, where it is built:
  `new Pool({ statement_timeout: 30_000 })`, `extra: { statement_timeout: 30_000 }` on a TypeORM data source,
  `requestHandler: { requestTimeout: 30_000, throwOnRequestTimeout: true }` on an AWS SDK client
  (`nitpicker/require-client-timeout`).
- In a server project, dates use UTC or a named zone, never the server's own: `getUTCHours()`,
  `toISOString()`, `Date.UTC(...)`, `{ timeZone }` for `Intl.DateTimeFormat` and `toLocale*String`,
  luxon `{ zone }`, date-fns `{ in: tz(zone) }`, dayjs `.utc()` (`nitpicker/no-local-time-zone`).
- In a server project, a number, boolean or date read from the query string, path, headers or a
  multipart form is converted where it is declared, since the value arrives as text: `z.coerce.number()`,
  `z.stringbool()`, `@Type(() => Number)` with class-validator, `@Transform(({ value }) => value === 'true')`
  for a boolean, `ParseIntPipe`/`ParseBoolPipe` on a single NestJS parameter. Never `z.coerce.boolean()`
  or `@Type(() => Boolean)`: they turn `"false"` into true (`nitpicker/no-uncoerced-request-input`).
- In a server project, text from a search or filter field is trimmed once before it reaches a lookup:
  `req.query.q?.trim()`, a zod `.trim()` schema, `@Transform(({ value }) => value.trim())` on the DTO field,
  or one global pipe or middleware that trims every string; a padded `" Davis"` finds nothing
  (`nitpicker/no-untrimmed-request-text`).
- Let the database count, filter, sort and aggregate: `count`/`exists`/`findFirst` instead of
  `(await repo.find()).length`, `where` instead of `.filter`/`.some`/`.find` on the rows, `order`/`orderBy`
  instead of `.sort`, and the ORM's aggregate or `groupBy` instead of `reduce`, `Math.max(...rows.map(...))`
  or `groupBy` (`nitpicker/no-in-memory-query`).
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
- Rows read from a stream, async generator or cursor are handled as they arrive: in `for await`, flush
  a fixed-size batch inside the loop (`if (batch.length >= 500) await save(batch.splice(0))`) and the
  rest after it, never one array of every row (`nitpicker/no-collected-stream-rows`).
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
- Each finding names the allowed form. A deliberate exception goes in `nitpicker.config.json`
  `exceptions` (rule, paths, reason), never inline.
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "./node_modules/nitpicker/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
