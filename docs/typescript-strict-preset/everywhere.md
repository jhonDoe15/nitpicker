# Everywhere

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- `@typescript-eslint/no-unused-vars` checks every parameter of production code, not only the ones
  after the last used one (`args: 'all'`). A parameter finding is held to the edited lines, like a
  formatting finding: an unused parameter on a line you add or edit is new, also in a function
  that already had another one, and one on a line you did not touch stays unchanged. Other unused
  names (variables, imports, caught errors) keep the ratchet: a function must not gain more of
  them. Remove the parameter and update the callers. A parameter that an override or a callback
  signature requires starts with `_` (`(_event, context) => context`); that is the one marker,
  and `nitpicker/naming-convention` already accepts it. A destructured property is dropped from
  the pattern or renamed (`{ total: _total }`), and a callback whose position matters (an Express
  error handler takes four parameters) renames the unused one (`_req`). A key destructured only to
  leave it out of a rest object (`const { a, ...rest } = options`) is not reported. Tests keep
  ESLint's default (trailing unused parameters). The JavaScript preset uses the same options.
- `nitpicker/no-self-recursion`: no function that calls itself or refers to itself
  (`xs.flatMap(flatten)` inside `flatten`), and no functions of one file that call each other
  (`evens` and `odds`), in all production code (`domain/`, `adapters/`, the composition root and
  shared code), not in tests. A reference counts when it is called, constructed or passed to an
  array method (`map`, `flatMap`, `forEach`, `filter`, `reduce`, `sort` and the like); a
  component that renders itself in JSX, `setTimeout(poll)` and an event handler that removes
  itself are not reported. A call inside a callback counts as the enclosing function's call when
  the callback is an array-method callback or is passed to a call whose result is used
  (`await limit(() => crawl(link))`); a callback handed to a timer or an event registration
  (`setTimeout`, `on`, `addEventListener`, `subscribe` and the like) or to a call written as a bare
  statement is its own function. Allowed forms: a retry or poll
  is a `for...of` over attempt numbers with `await` inside the loop; a tree walk (directories, AST,
  JSON) is a `for...of` over a worklist that each step pushes the node's children onto
  (`for (const node of pending) { pending.push(...children) }`); flat data uses `map`, `filter`,
  `flatMap` or `Object.fromEntries`. `domain/` has no loops and no recursion, so a walk over a tree
  of unknown depth moves to `adapters/`, which passes `domain/` the flat result.
- `for...of` is the only loop, in all production code (not just `adapters/`). No `forEach`,
  `for(;;)`, `for...in`, `while`, or `do...while`. `domain/` is stricter and has no loops at all.
- `nitpicker/no-accumulating-spread`: an accumulator that grows is not spread into its own next
  value, in all production code (not in tests). It reports `...acc` in the callback passed straight
  to `reduce` or `reduceRight` when `acc` is the callback's first of exactly two parameters
  (`xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {})`, `xs.reduce((acc, x) => [...acc, x], [])`),
  and a `let` accumulator declared outside a loop whose first reassignment, inside the loop, spreads
  it into an array or object literal (`out = [...out, x]`). Each step copies everything collected so
  far, so the work is quadratic. An accumulator that cannot grow is not reported: an object literal
  whose other entries are all fixed keys (`({ ...acc, paid: acc.paid + x.v })`) and an array that is
  cut back at once with literal bounds (`[...acc, x].slice(-3)`, `.slice(0, 3)`). Allowed forms:
  build the result in one pass with `Object.fromEntries(xs.map((x) => [x.key, x.value]))`,
  `new Map(xs.map((x) => [x.key, x]))`, `Object.fromEntries(parts.flatMap((p) => Object.entries(p)))`
  (to merge objects), `Object.groupBy`, `flatMap`, `map` or `filter`; in `domain/` TypeScript writes
  the entries `as const` (`[x.key, x.value] as const`) so the result keeps its key and value types;
  outside `domain/`, a `const` array or object declared before a `for...of` loop that the loop
  pushes onto or sets keys of. `Object.groupBy` and `Map.groupBy` need `lib` `ES2024`, which
  TypeScript 5.7 and later accept. The message follows the file: in `domain/` it names only the
  one-pass forms. An exception fits only when the input stays small. In `domain/` the loop form is
  already reported by the loop ban and `functional/no-let`, so this rule does not report it a second
  time. Known limit: the rule reads the inline callback, so a reducer passed by name
  (`xs.reduce(addInvoice, none)`) is not checked, and the same spread there is just as quadratic. A
  spread of the current element (`{ ...x, total }`), a spread inside a function nested in the
  reducer and a callback with one or three parameters are not reported either. A spread in `map`
  that adds a field (`items.map((item) => ({ ...item, done: true }))`) is the allowed immutable
  update and is not reported: copying one element per step is linear.
- `nitpicker/no-costly-collection-form`: a collection form with a cheaper equivalent, in all
  production code (not in tests). It reports an array declared with an array literal that gets
  `push`, `unshift` or `xs = [...xs, x]` and is searched with `includes`, `indexOf(x) === -1` (or
  another test against `-1` or `0`) or `some((y) => y === x)` inside a loop, a callback or a
  recursive function such as a visitor; an array also used by position (`xs[i]`, `splice`, `sort`,
  `pop`, `shift`, `at`, a positional `indexOf`) is left alone. Allowed form: a `Set` (`add`, `has`;
  `[...set]` keeps insertion order). It reports `find`, `findIndex`, `findLast`,
  `findLastIndex` or `some` whose callback only compares a property of the item with `===` or `==`
  to a value that is not a literal (`handlers.find((h) => h.message === event.type)`), inside a
  loop, an iteration callback (`map`, `forEach`, `filter`, `reduce` and the like) or a listener
  (`on`, `once`, `addListener`, `prependListener`, `addEventListener`, `subscribe`), on a binding declared outside it that is never
  reassigned or changed in place (`push`, `splice`, `sort` and the like), or a `this` field that
  only the constructor assigns. Allowed form: a `Map` built once, before the loop or handler. It
  reports `sort(...)` or `toSorted(...)` followed by `[0]`, `.at(0)`, `.at(-1)`, `.pop()`, `.shift()`
  or a one-element destructuring (`const [first] = xs.toSorted(cmp)`); `xs.sort()` on a binding read
  again later, or on a property, keeps the sorted array and is left alone. Allowed form: one pass
  with `reduce`, or `Math.min`/`Math.max` for a few numbers. An exception fits only for a list that
  always stays a handful of items. The rule reads no types, so it behaves the same in the
  JavaScript preset; it reads local arrays only, not class fields or exported arrays. The same rules run as `list-used-as-set`, `linear-lookup-in-loop` and ruff
  `FURB192` (Python), `pmd/ListUsedAsSet`, `pmd/LinearLookupInLoop` and `pmd/SortForExtreme` (Java)
  and `kotlin-source/` rules of the same names (Kotlin). Only this rule also reads `indexOf`
  and identity `some` as membership tests and listeners as repeated runs.
- `async`/`await` and `Promise.all`. No `.then()`, `.catch()` or `.finally()` chains, and no promise
  left without being awaited (`@typescript-eslint/no-floating-promises`). Deliberate
  fire-and-forget is written `void job();`, typescript-eslint's own form; `.then()` and `.catch()`
  do not count. In production code `void` passes only when nothing can leave the promise rejected
  (`nitpicker/no-unhandled-void-promise`, which reads types): `job` is an async function whose
  whole body is `try` statements with a `catch`, where no `catch` or `finally` throws or awaits
  outside a nested `try` with its own `catch`, and no `return` inside the `try` hands back a promise
  without `await` (that rejection would skip the `catch`). The function may be declared in the same
  file, imported, a method of the class, or written inline as `void (async () => { ... })()`.
  Node.js exits on an unhandled rejection by default, so `void report(id)` on a call that can reject,
  on a method known only through an interface, or on a promise variable is reported. A
  detached-work runner the project already has (a queue, a supervisor) that handles rejections in a
  way the rule cannot see is named under `conventions` as
  `"typescript.detachedWorkRunners": ["runDetached"]`; `void runDetached(...)` and
  `void tasks.runDetached(...)` then pass. The preset picked this form over typescript-eslint's
  `ignoreVoid: false`, which would leave no allowed fire-and-forget form at all, since `.catch()` is
  banned. `await Promise.allSettled(...)` with its result dropped hides every rejection, and
  `new Promise((resolve) => resolve(value))` wraps a value that `Promise.resolve(value)` or an
  async function returns directly.
- An `'error'` listener on every socket, file stream, child process and client the code creates
  (`nitpicker/require-error-listener`, production code). Node.js throws an `'error'` event that
  has no listener, so a dropped connection, a missing file or a failed spawn stops the whole
  process. The rule reports a value kept in a variable or an instance field (`this.client = ...`,
  `this.client ??= ...`, `#client`, `client = new ImapFlow(...)`) when it comes from
  `fs.createReadStream`/`createWriteStream`, `net`/`tls` `connect`, `createConnection` and
  `new Socket()`, `dgram.createSocket`, `http(s).request`/`get`, `http2.connect`,
  `child_process.spawn`/`fork`, the `zlib` stream factories, `worker_threads` `Worker`, node-redis
  `createClient`/`createCluster`, `pg` `Client`/`Pool`, `ws` `WebSocket` and `ImapFlow` (also
  behind a ternary, `??` or chained setters such as `.setTimeout(...)`), and the socket handed to a
  `net` or `tls` `createServer` callback or `'connection'` listener (an inline function or one
  declared in the file). In TypeScript files the type checker also catches `new` of a project class
  that extends one of those (`class Mailer extends ImapFlow`, `class Link extends net.Socket`);
  JavaScript files use the import table only. Allowed: `.on`/`.once`/`addListener`/
  `prependListener('error', ...)` on the variable anywhere in its scope, or on the field anywhere in
  the class (also after chained calls such as `.setTimeout(...)` or `.on('data', ...)`); passing it
  to `pipeline` or `finished` (`node:stream`, `node:stream/promises`), as the first argument of
  `events.once`/`events.on`, a `node:stream/consumers` reader, `Readable.from`/`Readable.toWeb` or
  NestJS `StreamableFile`; `readline.createInterface({ input })`; `for await` over it or
  `toArray()`/`forEach()`; a project function or constructor whose parameter gets an `'error'`
  listener, a `for await` or a `pipeline`/`finished`/`once` call, also through a parameter property
  (`constructor(private socket: Socket)`) or up to three helpers deep (read through the type
  checker, so imported helpers count; without type information any call to a function of the file,
  a relative import or a `this` method hands the value over); a Fastify `reply.send(stream)`; and a
  value that is returned, yielded, exported, assigned to another name or field, or destructured from
  `this`, which leaves the listener to its new owner. In-memory streams (`new PassThrough()`,
  `new Readable(...)`) and plain `EventEmitter`s emit `'error'` only when the code itself does, so
  they are not reported; neither are `ioredis` (it logs instead of throwing), `exec`/`execFile`
  (they attach their own listener) or servers (`http.createServer`, `net.createServer`,
  `WebSocketServer`), which fail at startup. `stream.pipe(dest)` does not count, since `pipe`
  forwards no errors, and neither does an object holding the value passed to a library
  (`new RedisStore({ client })`). Known limits: a static field, a parameter default and a
  constructor function outside a `class` are not read, and a variable assigned twice counts a
  listener on either value for both.
- Bounded fan-out (`nitpicker/unbounded-fan-out`): `Promise.all`, `allSettled`, `any` and `race`
  (also through a `const P = Promise` alias) over `xs.map(...)`, `xs.flatMap(...)`,
  `Array.from(xs, ...)`, `Array.from({ length: xs.length }, ...)`, a `const` holding one of those,
  a spread of one, or an array filled by `push` inside a `for...of`, `for...in`, `for` or `forEach`
  over `xs`, where the callback makes a remote call (HTTP or RPC: `fetch`, `ofetch`, `axios`,
  `got`, `ky`, `superagent`, `needle`, `undici`, `node-fetch`, `cross-fetch`, `http(s).request`,
  `@nestjs/axios`, `graphql-request`, AWS SDK v3 `client.send`, OpenAI, Anthropic, Stripe, Octokit
  and Slack clients) or publishes to a broker (`kafkajs`, `amqplib`, `amqp-connection-manager`,
  `nats`, `@google-cloud/pubsub`, `bullmq`, `bull`, `mqtt`, `ioredis` and `redis` `publish`, Azure
  Service Bus, SQS, SNS, EventBridge and Kinesis). The HTTP module lists are shared with
  `require-http-timeout`. It follows aliases, `require`, `await import()`, `axios.create()`-style
  instances, `this.client` class fields and parameters typed with the library type, and a helper
  function or method of the same file (up to three calls deep), reporting `load()` with the
  `fetch()` it reaches. `pMap(xs, fn)` without a numeric `concurrency` runs unlimited too and is
  reported. `race` and `any` are reported like `all`: they settle on the first result, but every
  call has started by then. Database calls are not this rule's business: the per-item I/O rule
  reports them with the batching remedy. Allowed: the call wrapped in a limiter created outside the
  callback with an explicit bound (`pLimit(8)`, `p-queue` with `concurrency`, Bottleneck with
  `maxConcurrent`, `p-throttle` with `limit`, `async-sema`, `async-mutex` `Semaphore`, `limiter`),
  held in a local, a class field (`limit = pLimit(4)`, or `this.limit = pLimit(4)` in the
  constructor) or received as a parameter or parameter property; a limiter imported from a file of
  the project whose name ends in `limit`, `limiter`, `queue`, `sema`, `semaphore`, `throttle` or
  `mutex`; `sema.acquire()` in the callback; a literal or `const` array or object (also
  `as const`, `satisfies` and `!`), the values of a TypeScript `enum`, `slice` or `splice` with an
  explicit size (`urls.slice(i, i + SIZE)`), and `for...of` over `chunk(xs, 20)`-style calls
  (`chunk`, `chunked`, `chunks`, `splitEvery`, `cluster`, `batch`). A worker pool is bounded by
  its count: `Array.from({ length: workers }, ...)` and `for (let i = 0; i < workers; i++)` pass,
  while a count taken from a collection (`xs.length`, `xs.size`) stays a fan-out over `xs`. A
  concurrency constant that no limiter uses, a limiter built inside the callback and
  `pLimit(Infinity)` bound nothing. The message names the collection, the call and the target, and
  the limiter, chunked and batch forms. Limits: a helper in another file is not followed, an array
  built with `reduce` or promises wrapped in `new Promise(...)` are not traced, an imported
  limiter is recognized by its name only, a client that arrives untyped through a parameter or an
  unlisted library is not recognized, and a collection that is small in practice but not by
  construction is reported; lift such a path with an `exceptions` entry for the rule.
- Bounded RxJS fan-out (`nitpicker/unbounded-reactive-fan-out`): the RxJS counterpart of
  `unbounded-fan-out`, for `rxjs` and `rxjs/operators` imports (named or `import * as rx`). It
  reports `mergeMap`, `flatMap` and `mergeAll` without a concurrency argument (unlimited by default;
  `Infinity` counts as none) inside a `.pipe(...)` whose source is a collection: `from(xs)`,
  `of(...xs)`, a `const` holding one, or an earlier `.pipe(...)` on one; `mergeAll()` right after a
  `map(...)` there counts as a `mergeMap`. With type information,
  `from(x)` counts only when `x` is an array, a tuple, a `Set`, a `Map` or another iterable, so
  `from(promise)` passes; without it, `x` must be an array literal, an array method call or a name.
  It also reports `forkJoin`, `combineLatest`, `zip` and `merge` over `xs.map(...)` (also spread, a
  `const` holding one or an array filled by `push` in a loop), which subscribe to every element at
  once. The projected work must make a remote or message call, recognized as in
  `unbounded-fan-out`, plus Angular's `HttpClient` (`@angular/common/http`, a parameter property, a
  field typed with it or set with `inject(HttpClient)`, which also counts for `unbounded-fan-out`)
  and `ajax` from `rxjs/ajax`; `from(fetch(...))` and `defer(() => fetch(...))`
  count. Allowed: a numeric concurrency argument (`mergeMap((id) => load(id), 8)`, a `const` or a
  parameter), `concatMap`, a `bufferCount`, `bufferTime`, `toArray`, `windowCount`, `reduce` or an
  operator that lets one value through (`first`, `last`, `single`, `count`, `min`, `max`, `every`,
  `isEmpty`, `find`, `findIndex`, `elementAt`) before the operator, a `take` or `takeLast` there whose count does not read a `length` or `size`, `merge(...calls, 4)`, a fixed collection, and a stream that is not a
  collection (events, `actions$`, route parameters), which this rule leaves alone. Limits: a
  standalone `pipe()` composition and a `mergeMap` nested inside the projection are not followed,
  and without type information any name passed to `from()` counts as a collection.
- No schema change by the ORM at startup (`nitpicker/no-orm-schema-sync`, the TypeScript and
  JavaScript counterpart of the Spring rule `spring/ddl-auto`): TypeORM `synchronize` or
  `dropSchema` on in ORM options (an object passed to `new DataSource`, `new Sequelize`,
  `createConnection`, `TypeOrmModule.forRoot`, `MikroORM.init`, `defineConfig` or `knex`, returned
  by the `useFactory` of a `*Module.forRootAsync`, or shaped like ORM options: `entities`,
  `migrations`, a driver `type`, a Sequelize `dialect`), `synchronize()` and `dropDatabase()` on a
  TypeORM data source, `sync()` on a Sequelize instance or model (with or without
  `force`/`alter`), `@nestjs/sequelize` `autoLoadModels` without `synchronize: false`, and MikroORM
  `updateSchema`, `createSchema`, `dropSchema`, `refreshDatabase` and
  `ensureDatabase({ create: true })`. A value read from `process.env`, a comparison, a negation or
  `Boolean(...)` (`synchronize: process.env.NODE_ENV !== 'production'`) is reported too: it still
  changes the schema in every other environment. Allowed: migrations (`migrationsRun`,
  `typeorm migration:run`, `sequelize-cli db:migrate`, `orm.migrator.up()`,
  `prisma migrate deploy`). The repository check `start-schema-push` reports the same thing in a
  `start` script (`prisma db push`, `drizzle-kit push`, `typeorm schema:sync`).
- No query logging left on (`nitpicker/no-orm-query-logging`, the counterpart of
  `spring/unsafe-diagnostics`), in ORM options as above: TypeORM `logging` set to `true`, `'all'`
  or a list with `'query'`; Sequelize `logging` set to `console.log`, `true` or a function without
  a condition, `logQueryParameters: true`, and `new Sequelize(...)`, `SequelizeModule.forRoot(...)`
  or a `SequelizeModule.forRootAsync` factory without `logging: false` (Sequelize logs every query
  by default); Prisma `log` with `'query'` or `{ level: 'query' }` printed to stdout; MikroORM and
  Knex `debug` on or a list with `'query'`; Drizzle `logger: true` or `new DefaultLogger()`.
  Conditions and environment reads are reported as above. Allowed: `logging: false` with
  slow-query logging (TypeORM `maxQueryExecutionTime`, Sequelize `benchmark: true` with a logging
  function that tests the duration, Prisma `{ emit: 'event', level: 'query' }` with a handler that
  filters by duration) or the database's own slow-query log. Both rules skip tests; a local script
  under the source roots takes an `exceptions` entry.
- No query rows counted, filtered, sorted or aggregated in memory (`nitpicker/no-in-memory-query`,
  the counterpart of the Spring rule `pmd/SpringDataFilterInQuery` and of the Python
  `in-memory-query`). A query result is an awaited `find`, `findBy`, `findByIds`, `findMany`,
  `findAll` or query builder `getMany` (TypeORM, Prisma, Sequelize, MikroORM, Drizzle's relational
  queries), or a Drizzle `select().from(...)` that does not already select `count()` or group, in a
  file that imports the ORM (Prisma: `@prisma/client`, or a receiver named `prisma`, `prismaService` or `prismaClient`). The receiver
  must look like a repository or model: a name with `repo`, `manager`, `model`, `prisma`, `orm` or
  `entit` in it, `em`, `db`, `tx`, `trx` or `query`, or a capitalised model name. A paged query
  (`take`, `skip`, `limit`, `offset` or `cursor`) and a call with a string first argument are left
  alone. It is reported when the result, directly or through a variable assigned once and read
  once outside a loop or a nested function, is only used for its `length` or lodash
  `size`/`isEmpty` (use `count`, `exists` or `findFirst`); `filter`, `some`, `every`, `find`,
  `findIndex` or `findLast` (use `where`); `sort` or `toSorted` with a comparator, or lodash
  `sortBy`/`orderBy` (use `order`/`orderBy`); or `reduce`, `Math.max`/`Math.min` over a `map`,
  `Object.groupBy`, `Map.groupBy` and the lodash `sumBy`, `maxBy`, `minBy`, `meanBy`, `groupBy` and
  `countBy` (use the ORM's aggregate or `groupBy`). The callback may only read row fields (directly
  or destructured), compare them with constants, parameters and locals, and call `localeCompare`,
  `getTime`, `valueOf`, `startsWith`, `endsWith`, `includes`, `toLowerCase` or `toUpperCase` on a
  field, or `includes`/`has` on a list that does not depend on the row. A callback that calls
  anything else, uses `typeof`, reads the row as a whole or by a computed key, or (with type
  information) reads a getter or a method of the row type is left alone, and so is a result the
  code also uses another way. `for` loops over the rows and `.then(...)` callbacks are not
  followed. Tests are skipped. A small fixed lookup list that is meant to be loaded whole takes an
  `exceptions` entry.
- `===` and `!==` only (`eqeqeq`). Braces on every `if`, `else` and loop body (`curly`). One import
  statement per module (`no-duplicate-imports`; a separate `import type` is fine).
- Logic mistakes the bundled rules catch, in production code and tests of both presets
  (`eslint-config/logic/logic-rules.mjs`): a `map`, `filter`, `find` or `reduce` callback with a
  path that returns nothing (`array-callback-return`; `forEach` is banned anyway); `sort()` or
  `toSorted()` on numbers without a compare function, which sorts them as strings
  (`@typescript-eslint/require-array-sort-compare`, type-aware; a string array is fine, and an
  untyped JavaScript one passes once JSDoc types it); a loop whose body always leaves on the first
  pass (`no-unreachable-loop`); a loop condition nothing in the loop
  changes (`no-unmodified-loop-condition`, for the loops config files and exceptions allow);
  `${...}` inside a plain string (`no-template-curly-in-string`; an exception fits text another
  tool fills, such as shell, CI or Kotlin source); a constructor that returns a value (`no-constructor-return`); a bare
  `return;` at the end of a function (`no-useless-return`); a private class member nothing reads
  (`@typescript-eslint/no-unused-private-class-members`); `'a' + 'b'` (`no-useless-concat`) and
  `fn.call(undefined, x)` (`no-useless-call`). `no-promise-executor-return` and `no-loop-func` stay
  off: their reports were almost all harmless forms such as an executor that returns
  `server.listen(...)` and handlers that share a flag on purpose, and `for...of` with `const`
  bindings already removes the late-binding bug `no-loop-func` exists for. Python's counterparts are ruff `PLE0101`,
  `B023` and `PLR1711`; in Java and Kotlin a missing return does not compile and the existing
  unused-member checks already report an unused private member.
- Identifier casing (`nitpicker/naming-convention`, which wraps
  `@typescript-eslint/naming-convention`): types and type parameters in PascalCase; functions,
  variables and parameters in camelCase; constants may be UPPER_CASE; a leading underscore is
  allowed. A schema constant may be PascalCase when its initializer starts from a binding imported
  from `zod`, `valibot` or `yup`, under any name (`const Order = z.object(...)`, then
  `type Order = z.infer<typeof Order>`, or a bare `object({...})` imported from valibot), or from
  another schema constant (`const CreateOrder = Order.omit({ id: true })`), or from an imported
  PascalCase binding through a schema method such as `.extend`, `.omit`, `.pick` or `.array`
  (`const Event = BaseEvent.extend({...})`), and so may a parameter typed as a component
  (`ComponentType`, `FC`, `ElementType`) or named `*Component`. PascalCase functions and variables
  are allowed in a React project. When the project depends on a framework with file-based route
  handlers (`next`, `@sveltejs/kit`, `astro`, `@solidjs/start`), an exported function named
  `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` or `OPTIONS` is allowed. Names a destructuring
  takes from external data are not checked.
- Exported production functions declare their return type
  (`@typescript-eslint/explicit-module-boundary-types`): `export function total(rows: readonly Row[]): number`;
  a React component returns `ReactElement`. A function typed by its variable
  (`export const handler: Handler = ...`) counts as typed. Tests and JavaScript files are exempt.
- No deprecated API (`@typescript-eslint/no-deprecated`, type-aware, from the `strictTypeChecked`
  set): a call, import or type that its declaration marks `@deprecated` (`new Buffer`, `url.parse`,
  `fs.exists`, a deprecated React type) is reported with the replacement the deprecation names.
  The check is the TypeScript counterpart of the Java preset's `javac/deprecation` and
  `javac/removal` lint. A deprecation without a replacement, or an API the project must keep
  calling, takes an exception for the rule in `nitpicker.config.json`.
- No magic numbers (`nitpicker/no-magic-numbers`, which wraps
  `@typescript-eslint/no-magic-numbers`): name the number with a module-level constant; any number
  in its initializer is allowed (`const SECONDS_PER_DAY = 24 * 60 * 60;`,
  `const RETRY_STATUSES = [429, 503] as const;`). `-1`, `0`, `1`, `2`, `10`, `100` and `1000`
  (so `Math.round(x * 100) / 100`), an HTTP status code in the status argument of a response or
  error call (the first argument of `status`, `sendStatus`, `code`, `writeHead` and a bare `error` or
  `fail`, the second of `text`, `json`, `body` and `html`, either of `redirect`, `throw` and a
  callee named `...Error` or `...Exception`: `res.status(404)`, `c.json(body, 201)`,
  `new HttpException('gone', 410)`), the digits of `toFixed(2)` and `toPrecision(3)`, default parameter values, array indexes, numeric literal types
  and object property values are allowed. `x % 7` is reported: name the divisor. Tests are exempt.
- Security: no `eval` (`no-eval`); no regular expression with nested or overlapping quantifiers
  that backtracks super-linearly (`regexp/no-super-linear-backtracking`, from `eslint-plugin-regexp`);
  no shell command built from a variable or template (`nitpicker/no-shell-string-command`: `exec`
  and `execSync`, also through `promisify(exec)`, take a string literal or a `const` holding one,
  otherwise `execFile(program, [args])`; `shell: true` is reported, also in a `const` options
  object or a spread of one, and so is `sh`, `bash`, `zsh` or `cmd` run through
  `spawn`/`execFile` with `-c` (`/c`) and a command that is not a string literal); no
  `Math.random` for ids
  or tokens (use `crypto.randomUUID()` or `crypto.randomInt()`, or take the value as a parameter);
  no `fs` call on a path built from a parameter after its first segment (`path.join`,
  `path.resolve`, a template literal `` `${dir}/${name}` `` or `+`, also inside
  `path.normalize`/`path.resolve`, through a `const` or `let` variable, or a call on a parameter
  such as `c.req.param('file')` or `req.query.name`) unless the function checks containment on
  the variable in an `if` that returns, throws, `continue`s or `break`s before the call, or wraps
  the call in the `if`'s passing branch (`nitpicker/no-unsafe-path-join`:
  `const full = path.resolve(base, name); if (!full.startsWith(base + path.sep)) return ...`, or
  `if (path.relative(base, full).startsWith('..')) throw ...`). The prefix must end in a
  separator (`base + path.sep`, `` `${base}/` ``, `'/srv/'`): `full.startsWith(base)` also
  accepts `/srv-other`. A parameter as the first segment is the base and is fine
  (`path.join(dir, 'package.json')`).
- Security sinks: SQL built from strings, weak hashes, disabled TLS checks, HTTP calls without a
  timeout and unsafe deserialization. All five apply to production code, not to test support files (`test-support/`, `mocks/`, `__mocks__/`,
  `__fixtures__/`, `fixtures/`, `stories/`, `.storybook/`, `*.stories.*`, `setupTests.*`); each message
  names the allowed form and the exception route. They follow `const` values, aliases
  (`import { createHash as digestOf }`, `const run = pool.query.bind(pool)`, `const { createHash } = crypto`),
  `require`, `require(x).default`, `import x = require(x)`, `await import(x)`, default and namespace
  imports, `enum` members, `readonly` class fields, and options objects held in a `const` or spread from one.
  - `nitpicker/no-sql-string-building`: SQL text made by `+`, a template literal, `concat`, `join`,
    `replace` or `util.format` with a runtime value in it. Text counts as SQL only with SQL context:
    it starts with an upper-case statement (`SELECT ... FROM`, `INSERT INTO`, `UPDATE ... SET`,
    `DELETE FROM`, `WITH x AS (`, DDL) or an upper-case clause (`WHERE id =`, `ORDER BY`, `LIMIT`),
    or it reaches a query call: one named like `query`, `execute`, `raw`, `run` or `prepare`, or a
    pg-promise method (`none`, `one`, `any`, `oneOrNone`, ...), where lower-case SQL and a fragment
    such as `where id = ` before a value count too. English text, errors, log lines and JSX text are
    not SQL. Query-builder sinks count any runtime value: knex `whereRaw`, `orderByRaw` and the other
    `*Raw` methods, `sql.raw`, `Sequelize.literal`; TypeORM `where`/`andWhere`/`having` on a query
    builder count a value after a comparison, and `orderBy`/`groupBy` any value that is not an alias
    prefix (`${alias}.created_at`). Allowed: bind parameters (`$1`, `?`, `:name`), the project's tagged
    template (`` sql`...` `` in drizzle-orm, kysely, postgres, `` prisma.$queryRaw`...` ``; the message
    names the one in `package.json`), placeholder lists built only from placeholders
    (`ids.map(() => '?').join(',')`, `rows.map(() => '(?, ?)').join(', ')`, `'?,'.repeat(n).slice(0, -1)`,
    `Array.from(ids, () => '?')`, `$${i + 1}`, `$${params.length + 1}`), the optional-filter builder
    (`conditions.push('name = ?')` joined with `' AND '`), a table or column from a fixed lookup
    (`COLUMNS[key]` into a `const` object of plain names, also in JavaScript and `Object.freeze`, or a
    `for (const table of TABLES)` loop over a `const` list), and values that cannot carry SQL:
    numbers, `Number(x)`, `ids.map(Number)`, `Math.*`, `.length`, `mysql.escape(x)`, and with type
    information a `number`, `number[]`, `boolean` or union of plain string literals (`table: 'users' | 'orders'`).
  - `nitpicker/no-weak-hash`: MD5, SHA-1, MD2/MD4 and RIPEMD-160 in `createHash`, `createSign`,
    `createVerify`, `crypto.hash`, `pbkdf2`, `hkdf`, WebCrypto `subtle.digest`, `sign` and `generateKey`, a
    call whose name says hash, digest or checksum (not a predicate such as `isWeakHash`), a `{ algorithm }`
    or `{ hashAlgorithm }` property, `crypto-js` `MD5`/`SHA1`/`algo.SHA1`, `@noble/hashes` and `hash-wasm`
    `md5`/`sha1`, and the md5 and sha1 packages. A string counts only when it is exactly an algorithm
    name (`'md5'`, `'SHA-1'`, `'RSA-SHA1'`), not a prefix such as `'md5-calculator'`. HMAC-SHA1
    (`createHmac('sha1')`, `HmacSHA1`, subtle `{ name: 'HMAC', hash: 'SHA-1' }`, TOTP options with
    `digits` or `period`) is allowed, since HMAC does not rest on collision resistance and TOTP and
    OAuth 1.0a fix it; HMAC-MD5 is reported with its own message. Allowed: `createHash('sha256')` or
    stronger, `createHmac('sha256', key)`, and `scrypt`, argon2 or bcrypt for passwords.
  - `nitpicker/no-disabled-tls-verification`: `rejectUnauthorized: false`, `strictSSL: false`,
    `sslValidate: false`, a `rejectUnauthorized` set from the environment or a condition
    (`process.env.NODE_ENV === 'production'`, `!isDev`), MongoDB `tlsAllowInvalidCertificates`,
    `tlsAllowInvalidHostnames` and `tlsInsecure`, `NODE_TLS_REJECT_UNAUTHORIZED` set to `0`
    (assignment, `env` object, the whole string, or shell text given to `exec`/`spawn`),
    `?sslmode=no-verify` and the MongoDB flags in a URL, a `checkServerIdentity` that returns nothing,
    `ignoreHTTPSErrors`, `acceptInsecureCerts`, and `--ignore-certificate-errors` (also Electron's
    `appendSwitch('ignore-certificate-errors')`) outside a blocklist or comparison. Not reported: a
    server's `requestCert: true, rejectUnauthorized: false` (optional client certificates checked
    through `socket.authorized`), `--ignore-certificate-errors-spki-list`, and the same words in help
    or warning text. Allowed: trust the CA with `ca: readFileSync(caPath)`, `tlsCAFile` or
    `NODE_EXTRA_CA_CERTS`, and pin a browser certificate with `--ignore-certificate-errors-spki-list`.
  - `nitpicker/require-http-timeout`: a `fetch` without a `signal` or `dispatcher`, `axios` (`get`,
    `post`, `request`, `create`) and `got` without `timeout` or `signal`, and `http`/`https`
    `request`/`get` without `timeout`, `signal` or `setTimeout` (also after a chained `.on()`, and with a
    named callback). A call whose options come from a parameter or a spread is not reported, options
    built in steps (`init.signal = ...`) count, and a client made by `axios.create({ timeout })` or
    `got.extend({ timeout })` covers its calls, as does an `axios.create()` instance whose every call
    passes its own timeout. A timeout set once for the project counts: `axios.defaults.timeout` with a
    non-zero value on the axios import or on the same instance, and undici
    `setGlobalDispatcher(new Agent({ headersTimeout, bodyTimeout }))`, in the same file or in any
    production module of the project. node-fetch 2's `timeout` option counts when the project's
    node-fetch is 2.x. `fetch(request)` passthrough (a service worker's `event.request`, an edge
    handler's `Request`), `data:` and `blob:` URLs and `new URL(path, import.meta.url)` are not
    reported, and `axios.getUri` sends nothing. `fetch` is not checked in browser projects (React,
    Preact, Vue, Svelte, Solid, Angular, read from `package.json`). Allowed:
    `fetch(url, { signal: AbortSignal.timeout(10_000) })`.
  - `nitpicker/timeout-abandons-operation`: `Promise.race([operation(...), timeout])` where one
    entry is a timeout and a losing entry is a call that gets no abort signal. `Promise.race` settles
    with the first entry and never cancels the others, so when the timeout wins the operation keeps
    running, holds its connection or lock and repeats its side effect if the caller retries. A
    timeout entry is a timer that rejects: a `new Promise` whose executor passes its `reject`
    parameter to `setTimeout` (also `globalThis.setTimeout` or `window.setTimeout`), a call to a
    function of the same file that does nothing but wait and rejects (through such an executor, a
    `throw` after an awaited timer in an `async` function, or `Promise.reject`), an imported helper
    named `rejectAfter`, `rejectAfterTimeout`, `rejectOnTimeout`, `timeoutAfter` or `timeoutPromise`,
    a constant bound to one of these, and a `.then()`, `.catch()` or `.finally()` chain on one. A
    timer that only resolves (`new Promise((resolve) => setTimeout(resolve, ms))`, `setTimeout` from
    `node:timers/promises`, `once(AbortSignal.timeout(ms), 'abort')`) is a hedge or a sleep, not a
    timeout, and is not reported; it becomes one when a `.then()` on it throws or returns
    `Promise.reject(...)`. The race is `Promise.race` on the global `Promise`, also through
    `globalThis.Promise` or a constant (`const P = Promise`); `const { race } = Promise` is not
    recognized, since calling it unbound throws a `TypeError` before any race starts. The losing
    operation is each call among the other entries, looking through a `const` that holds the call,
    a `.then()` chain, both branches of a `? :`, the calls a `new Promise` executor makes, the
    callbacks of `Promise.resolve().then(...)`, and `Promise.all`, `allSettled`, `race` and `any`
    lists; a loser that is itself a timer is skipped. The call passes when an argument is, or
    resolves to, an object with a `signal`, `abortSignal` or `cancelToken` key (an object with a
    spread counts, since its keys are unknown), a value named `signal`, `controller`,
    `abortController`, `cancelToken` or `*Signal`, `x.signal`, `AbortSignal.timeout(...)`,
    `AbortSignal.any(...)` or `AbortSignal.abort(...)`; an argument named `options`, `opts`, `init`
    or `settings` is unknown and passes. A `timeout` key on an unknown function does not pass, since
    nothing says the callee stops on it. It also passes when the callee is a function of the same
    file that uses such a signal from its enclosing scope, or when `.abort()`, `.cancel()`,
    `.destroy()`, `.kill()`, `.terminate()` or `.dispose()` is called on the operation's receiver or
    one of its arguments anywhere in the function holding the race, or on anything in the timeout
    path: the `catch` or `finally` of a `try` around the race, a `.catch()`, `.then()` or
    `.finally()` callback on the race, or the timeout entry itself. A callee of the same file that
    has a signal parameter (by name, or typed `AbortSignal`) the call leaves out gets the second
    message, which names the parameter. HTTP client calls that `nitpicker/require-http-timeout`
    recognizes (`fetch`, `axios` and an `axios.create(...)` instance, `got` and a `got.extend(...)`
    instance, `http`/`https`) are left to that rule: without a timeout it reports them, so the code
    gets one finding, and with one (`axios.get(url, { timeout })`, `axios.create({ timeout })`, a
    project default) the call has its own deadline. A browser project's `fetch`, which that rule
    does not check, is checked here. Allowed: create an `AbortController`, abort it in the timeout
    path and pass `{ signal: controller.signal }`, or pass `AbortSignal.timeout(ms)` to an API that
    takes `signal` and remove the race. Production source only: tests, stories and support files are
    not checked. Not recognized (so never reported): a race built from a spread or a computed array,
    an operation held in a parameter or a `let`, an inline async function, a timeout helper that is
    imported under another name, a timer that resolves with a sentinel the caller then checks
    (`sleep(ms).then(() => TIMEOUT)`), and a race on `Promise.any`. Whether a callee honours a signal
    it receives, and whether a losing call is pure (`parse(text)`), are not checked: a pure loser is
    reported like any other, and needs an exception. An intentional background task needs an
    exception for the rule with its paths and a reason.
  - `nitpicker/no-unsafe-deserialization`: `node-serialize`, `funcster` and `cryo` (they rebuild
    functions, also through `import x = require(...)` and `import()`), `v8.deserialize` (and the
    `v8.deserialize(v8.serialize(x))` copy, whose allowed form is `structuredClone(x)`),
    `vm.runInNewContext`, `runInThisContext`, `new vm.Script` and `compileFunction` with text that is
    not a string literal, js-yaml `DEFAULT_FULL_SCHEMA` (imported, destructured or re-exported), js-yaml
    3 `load`/`loadAll` without a `schema` (the installed major is read from the project), BSON
    `evalFunctions: true` and libxmljs `noent: true`. Allowed: `JSON.parse` checked against a schema,
    `yaml.load(text)` with the default schema in js-yaml 4, and `yaml.safeLoad(text)` in js-yaml 3.
- Child processes the code waits for have a deadline (`nitpicker/require-process-timeout`, production
  files; test files have `nitpicker/require-test-process-timeout`). From `child_process`, `execa` and
  `cross-spawn`: `execSync`, `execFileSync`, `spawnSync`, `execaSync` and `execaCommandSync` need a
  positive `timeout` (also cross-spawn's `spawn.sync` and execa's `$.sync`); `exec` and `execFile` (with a
  callback, or through `promisify`, also declared inside a function or called at once) need a `timeout`
  or a `signal`; `execa`, `execaCommand`, `execaNode` and execa's template tags (`` $`cmd` ``,
  `` $({ timeout })`cmd` ``) need a `timeout`, `cancelSignal` or `signal` when the result is awaited or
  `.then`-ed; `spawn` and `fork` need a `timeout` or `signal` when the
  code waits for the child to end: an `'exit'` or `'close'` listener registered inside a
  `new Promise` executor, or `await once(child, 'exit')`. A child held in a variable that is passed
  elsewhere, returned or `kill()`-ed (a hand-made deadline) is not reported, nor are options from a
  parameter, a call result or an unknown spread. A long-running child that nothing waits for (a dev
  server, a worker) is not reported, and neither are module bindings made inside a function
  (`require` there, `await import()`), zx, or a child whose end is awaited through a helper or by
  reading its stream to the end. `stdio: 'inherit'` gets no pass: an interactive child still
  hangs the program. A program whose purpose is to run a child to completion, such as a build
  wrapper, takes an exception. The rule reads no types, so it behaves the same in the JavaScript
  preset.
- Named exports list their names: no `export *`, which makes every internal export of a feature's
  `index.ts` public (`export { name } from './domain/x.js'`).
- Cognitive complexity of at most 15 per function, tests included (`nitpicker/cognitive-complexity`).
  Each `if`, ternary, `switch`, loop and `catch` costs 1 plus its nesting level; `else`, `else if`,
  labelled `break`/`continue` and each run of like `&&`/`||` cost 1. Unlike the published algorithm,
  every function, callbacks included, is scored on its own with nesting starting at 0, and code
  outside any function is not scored. A function that must stay complex gets an exception for the
  rule in `nitpicker.config.json`.
- Config files are exempt from the loop, `forEach` and promise-chain bans; `eqeqeq` still applies.
- `nitpicker/report-module-load-effects` also reports work done by a module-level `const`
  initialiser (`Date.now()`, `performance.now()`, `Math.random()`, `crypto.randomUUID()`, `fetch`,
  timers, a `...Sync` call from `fs`, `child_process`, `crypto` or `zlib` such as `readFileSync`
  (a project's own `buildTableSync()` is fine), any `process.*` call, `new Date()` with no
  argument, `new Worker`, `new WebSocket`) and any top-level `await`. Pure initialisers
  (`z.object(...)`, `new RegExp(...)`, `path.dirname(...)`) are fine. A main guard is not module
  load work: an `if` with no `else` runs its body only when the file is started as a script, so
  neither the `if` nor what it runs is reported, when its condition is exactly one of
  `import.meta.main`, `require.main === module`, or `import.meta.url` compared with
  `process.argv[1]`, `pathToFileURL(process.argv[1]).href`,
  `pathToFileURL(realpathSync(process.argv[1])).href` or `` `file://${process.argv[1]}` ``,
  optionally joined by `&&` with `process.argv[1]` or `process.argv[1] !== undefined`. The allowed
  form, which also holds when the script is started through a symlink, is:

  ```js
  if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    await run();
  }
  ```

  `process`, `require`, `module` and `undefined` must be the globals (an import of `node:process`
  counts) and `pathToFileURL` and `realpathSync` the imports from `node:url` and `node:fs`, not a
  local binding of the same name. Any other condition, such as `import.meta.env.DEV`, a bare
  `import.meta.url`, a call or a comma expression inside the comparison, is still reported.

- `nitpicker/no-production-console` reports every reference to `console`, not only calls:
  `console.log()`, `console['error']()`, `const log = console.log`, `const { log } = console`,
  `items.forEach(console.log)`, `const c = console` and `globalThis.console`. `typeof console` and a
  local binding named `console` are not findings.
  It also reports every reference to `process.stdout` and `process.stderr` outside the composition
  root, not only `.write()`: an alias (`const out = process.stdout`, `const p = process`,
  `const g = globalThis`), a destructured `stdout`/`stderr` (also nested, assigned, or through a
  `...rest`), an import or re-export from `node:process` (`export * from "node:process"` too), a
  `require` or `await import()`, `globalThis.process`, a `as`, `satisfies`, `!` or `<T>` wrapper
  around `process`, and an argument handed to a helper. A local binding named `process` is not the
  global one, and type-only imports and exports are not findings. Code outside the root takes a
  `{ write(text: string): void }` parameter; the composition root passes `process.stdout` and
  `process.stderr` (or writes to them), and that line is not a finding. Files listed in
  `layout.entryPoints` (and the detected framework entry) may reference the streams the same way;
  `console.*` stays a finding there. Reading `isTTY`, `columns`, `rows` or `hasColors()` is a
  reference too: the root reads the fact once and passes it down as a value, like the environment.
  The JavaScript preset runs the same rule. The hop needs no coverage or mutation exemption: a test
  calls the exported `main` with `vi.spyOn(process.stdout, 'write')` (as the eval fixtures do), so the
  arrow that forwards to the stream is covered and killed.
- Named functions use the `function` keyword; arrow functions only as callbacks.
- `type`, never `interface`, except in a `declare module` or `declare global` augmentation, or at
  the top level of a global declaration file with no imports or exports (such as `ImportMetaEnv` in
  `vite-env.d.ts`), which can only merge interfaces. No `enum` (use unions of string literals) and
  no `namespace`.
- Classes only for `Error` subclasses.
- Named exports only; config files and `declare module` blocks (`declare module '*.svg'`) are
  exempt.
- Early returns; no `else` after a `return`; no nested ternaries.
- A `switch` over a discriminated union must handle every case.
- `nitpicker/exhaustive-union-predicate` (type-aware): no `||` chain of `===` (or `&&` chain of
  `!==`) that compares one plain reference (`kind`, `props.kind`) with some string or number
  literals of a union that has at least three members, when the chain is a predicate's value: an
  arrow body, a `return`, or a value stored in a variable or assigned (also inside `!`, another
  `&&`/`||` or a ternary branch). A chain used as the condition of an `if`, `while`, `for` or
  ternary is ordinary narrowing and is not reported, and neither is a call argument. The same
  subset written as membership in an array or `Set` of literals (`['open', 'pending'].includes(s)`,
  `new Set(['open', 'pending']).has(s)`, also negated, with `as const`, or inside an `||` chain of
  comparisons) is reported. So is a `switch` over the union that lists at least two members whose
  cases return the same `true` or `false` while its `default` returns the other, so adding a
  `default` that returns `false` does not clear the finding. A list declared once
  (`const OPEN: Kind[] = ['a', 'b']`, then `OPEN.includes(kind)`) is one classification point and
  is not reported. Project `enum` declarations are not checked, since the preset bans `enum`.
  Allowed forms: a `switch` over the union with no `default`, or a
  `Record<Union, boolean>` lookup, so adding a member fails to compile. A subset check such as
  `status === 'open' || status === 'pending'` on a project union of three or more members is the
  case this reports. The message names the union by its alias (`Kind`) when the value's declared type
  has one, also after the value was narrowed or when it is `Kind | undefined`; an inline union is
  reported as "the union". It is not reported when the union comes from a library (its alias, or the
  property it is read from, is declared in `node_modules` or the default library, including a local
  binding or destructured parameter that holds a library value), when the comparison is on a
  property of a union-typed object (`event.type === 'a' || event.type === 'b'`, which narrows a
  discriminated union), or inside a function whose return type is a type predicate (`kind is
'a' | 'b'`), which names the subset in its type. The type is read at the first comparison, so an
  earlier guard that already narrowed the union can shrink it below three members. Add an exception
  for the rule when a partial test is intended.
- `nitpicker/no-singular-and-plural-prop`: two optional inputs `tag?: string` and
  `tags?: string[]` offer two ways to pass the same data. The rule reports the plural when both are
  optional (`?` or a default value) and the plural is an array (`T[]`, `readonly T[]`, `Array<T>`,
  `ReadonlyArray<T>`) of the singular's type; keep the plural and pass a single item as a
  one-element array. The names may differ by `-s`, `-es`, `y`/`ies` or an irregular plural of the
  last word (`selectedChild`, `selectedChildren`). It checks the parameters of an exported function,
  of the public methods and constructors of an exported class (not `private`, `protected`, `#name`
  or `override` ones), the properties of their parameter types, a component's props type, an
  exported type or interface whose name ends in `Props`, `Options`, `Opts`, `Params`, `Parameters`,
  `Args`, `Arguments`, `Input`, `Request`, `Config` or `Settings`, and the entries of an object
  schema from zod, valibot, superstruct or TypeBox
  (`z.object({ tag: z.string().optional(), tags: z.array(z.string()).optional() })`;
  `.optional()`, `.nullish()`, `.default()`, `optional(...)`,
  `nullish(...)`, `Type.Optional(...)` and `pipe(...)` count, and so do `X.array()` and length
  checks on the array). Required inputs (`contains(role: string, roles: string[])`), inputs that
  differ in type, a member typed `never` in a discriminated union and members in different union
  branches are not reported. `| undefined` and `| null` are dropped from both types before they are
  compared. Aliases and interfaces in the same file are followed; types imported from other files
  are not. JavaScript files carry no type annotations, so there only the schema entries are checked.
  Two members whose meanings differ (`owner?: User` for the main owner beside `owners?: User[]` for
  the co-owners) are the case for an exception with a reason.
- `nitpicker/no-unmapped-exception` (type-aware, TypeScript preset only): a NestJS handler (a
  method with a route or GraphQL decorator such as `@Get` or `@Query` in a `@Controller` or
  `@Resolver` class) that can throw a project exception class no exception filter in scope maps, so
  the client gets a 500. The walk follows calls into project functions and methods, resolved by the
  type checker, four levels deep, and the message names the call path. A `throw` inside a `try`
  that has a `catch`, or in the promise chain before a `.catch(...)`, is not followed, and neither is
  a function stored in a variable (a callback passed to a call is followed). A class is mapped when it or a superclass is a framework
  status class (`HttpException` and its subclasses, `RpcException`, `WsException`, `GraphQLError`,
  `ApolloError`) or a filter in scope catches it or a superclass: `@UseFilters` on the method or
  the class, `app.useGlobalFilters(...)`, or an `APP_FILTER` provider. A `@Catch()` or
  `@Catch(Error)` filter maps only the classes it checks with `instanceof`, since the rest fall
  through to a generic response. Exceptions from libraries, `throw error` of a variable, plain
  `Error` and a class whose base is a call (a mixin) are left out. The JavaScript preset does not run it, since it has no type information. Allowed:
  `class OrderNotFound extends NotFoundException {}`.
- `nitpicker/no-forwarding-wrapper` (type-aware): a module-level named function or `const` arrow
  whose body is one `return` (or an expression body) of a call that passes exactly its own
  parameters, in order, unchanged (`export const loadUser = (id: string) => fetchUser(id)`; an
  `async` one may `await` the call, and is flagged only when the callee is itself declared `async`,
  since an `async` wrapper turns a synchronous throw of any other callee into a rejection, as the
  Python preset decides) is flagged when its parameter types and return type are identical to the callee's, so a wrapper that
  brands, narrows or widens a type passes. The callee must be a module-level binding or an import
  that the file could re-export or the caller could import directly. Not flagged: member callees
  (`repo.find(id)`, `Math.abs(x)`, `api.get(url)`), callees that are parameters or closure variables
  (injected dependencies), functions declared inside a component, factory or other function,
  overload implementations, type-predicate and `asserts` functions (on either side), parameters
  whose optional or rest form differs from the callee's (`b?: number` over `b: number | undefined`),
  methods, generator functions, an `async` function over a callee that does not return the same
  promise type, functions with type
  parameters, calls with type arguments, optional calls, PascalCase names (components), functions
  without parameters, default, destructured or transformed parameters, and a `const` with a type
  annotation. A wrapper around a hook (`useUser(key)` over an imported `useQuery(key)`) is reported
  like any other when the callee is module-level. For an exported wrapper (an `export` declaration,
  `export default`, or an export list) the message gives the re-export under the exported name,
  `export { fetchUser as loadUser }` or `export { fetchUser as default }`; for a local one it says to
  call the callee directly and delete the wrapper.
- `nitpicker/no-tri-state-boolean`: a `boolean` that can also be `undefined` or `null` has three
  states that the type does not name. Reported as the whole type of a parameter, return type
  (also inside `Promise<...>`), type member or class field (`force: boolean | undefined`,
  `true | false | undefined`), for an optional boolean parameter (`force?: boolean`, including in
  function types and `declare` signatures) and for an optional boolean property
  (`{ force?: boolean }`). Not reported: an optional property of a type named `*Props` (a React
  component's props), a union with another type (`boolean | string`), a local variable, and a
  method with `override`. The message names a required `boolean` or a union of string literals.
  In the JavaScript preset the rule reads JSDoc types, so the type-aware rules need JSDoc types to
  see anything: `@param {boolean|undefined}`, `{boolean=}`, `{?boolean}`, a bare
  `@param {boolean} [force]` with no default, and `Promise<boolean|undefined>` in `@returns`.
  `[force=false]` (a default given), `@property` tags and dotted option names
  (`@param {boolean} [options.verbose]`) are not reported.
- `nitpicker/no-unhandled-url-parse`: `new URL(text)` or `new URL(text, base)` (also
  `new globalThis.URL`) where `text` or `base` is neither a constant string (a literal, a template
  or `+` of constants, or a `const` holding one) nor a `URL` value (a `new URL(...)` constant, a
  name annotated `URL`, an already parsed `.href`, `.url` or `.origin`) throws a
  `TypeError` on text that is not an absolute URL, so one odd stored, user or header value turns
  the call into an error response. The allowed forms are `URL.parse(text)` (`null` for bad text),
  a `URL.canParse(text)` check on the same text in the same or an enclosing function, and a `try`
  with a `catch` around the call in the same function (arrow callbacks inside the `try` count; a
  nested `function` does not). A module path against `import.meta.url`, or against a URL built from
  it, is not reported. The rule reads no types, so a `URL` parameter without an annotation is
  reported; `new URL(url.href)` passes. The Java and Kotlin presets report `URI.create(text)` the
  same way (`pmd/UriCreateDynamic`, `kotlin-source/UriCreateDynamic`); Python has no counterpart,
  since `urllib.parse` does not raise on such text.
- `nitpicker/no-parameter-mutation` (type-aware): a mutating method (`push`, `pop`, `splice`,
  `sort`, `reverse`, `add`, `set`, `delete`, `clear` and the other array, `Set`, `Map` mutators of
  `no-mutating-method-in-domain`) called on a parameter, or an assignment, `++` or `delete` on an
  index or `length` of a parameter whose type has a writable index signature (arrays, typed
  arrays, records), is flagged, also through `grid[0]!.push` and `counts['a']!++`. Only exported
  functions and public methods are checked: a function that is not exported, a nested function and
  a `private` or `#` method are helpers. Not flagged: a rest parameter, a copy
  (`const copy = [...items]`, or `items = items.slice()` / `[...items]` / `structuredClone(items)`
  before the call), an accumulator (the first parameter of a `reduce` or `reduceRight` callback,
  inline or named, and a parameter defaulted to `[]`, `{}`, `new Set()` or `new Map()`), an immer
  draft (a parameter inside `produce`, `produceWithPatches`, `createSlice`, `createReducer`,
  `useImmer` or `useImmerReducer`) and a `readonly` type (the compiler rejects the write).
  A write to a named property of a parameter object is flagged too: `options.retries = 3`,
  `options.length ??= 8` (also `||=`, `&&=`, `+=`, `++`), `delete item.id`, a nested
  `options.retry.count = 3` and `Object.assign(options, defaults)`, also through a simple alias
  (`const o = options`, `const o = options ?? {}`, `options = options ?? {}`). Only an object
  whose type is declared in the project or is an anonymous object type counts (an interface, a
  type alias, `Partial<Options>`, a record, a JSDoc `@typedef` or `{{ ... }}` type), and every
  member of a union must be one; a class instance, a class itself (`typeof Counter`), an enum, a
  function or callable type, a type from a library or `lib.*.d.ts` (`Error`, `RegExp`, a
  framework request), and an interface or intersection that extends one are left alone, since
  middleware writes to those are the norm. `as`, `satisfies` and `!` around the target count as
  the parameter (`(options as Options).size = 1`). The allowed form is a new object
  (`{ ...options, retries: 3 }`) or a copy first
  (`const next = { ...options }`, `options = { ...options }` or `Object.assign({}, options)`).
  A function that fills an object its caller hands it to be filled takes a config exception.
  The same aliases and nested named properties apply to the indexed and mutating-method forms
  (`const list = items; list.push(x)`, `input.items.push(x)`, `input.items[0] = x`), with the
  same project or anonymous type check on each named step.
  `domain/` files keep the stricter
  `no-mutating-method-in-domain` and do not get this rule. The shared method tables are in
  `eslint-plugin/rules/analysis/mutation/mutating-methods.mjs`.
- `nitpicker/no-falsy-default` (type-aware): `limit || DEFAULT_LIMIT` and `limit ? limit : DEFAULT`
  on a parameter that is optional, defaulted to `undefined` or `null`, or typed
  `| undefined` / `| null`, when its type also has a falsy value that is not absent (`number`,
  `string`, `boolean`, `bigint`) turns `0`, `''` and `false` into the default. Write
  `limit ?? DEFAULT_LIMIT`, or test `limit === undefined`. Not reported: a fallback equal to the
  falsy value (`name || ''`, `count || 0`, `flag || false`, where `??` gives the same result), a
  fallback of `undefined` or `null`, a condition (`if (a || b)`), and a value that is not a
  parameter. In the JavaScript preset the type comes from JSDoc; without JSDoc types the rule sees
  nothing.
- `nitpicker/strict-boolean-expressions` (type-aware, wraps typescript-eslint's
  `strict-boolean-expressions`; production and test files): a number tested for truthiness
  (`if (count)`, `retry ? a : b`, `!id`, `index && ...`, `cells[0] || ''`, `end - start ? a : b`, a
  `filter` callback that returns a number), where `0` reads as false or missing. Write the
  comparison: `count > 0`, `index !== -1`, `items.length > 0`, `id !== undefined` for an optional
  number, and `value ?? fallback` for a default. A union that mixes a number with another type
  (`string | number`) is reported too. Strings, objects, `any`/`unknown` and nullable booleans and
  strings stay allowed (`allowString`, `allowNullableString`, `allowNullableObject`,
  `allowNullableBoolean`, `allowAny`): a nullable boolean is only wrong when `false` carries a
  meaning of its own, so it is left out for now rather than reported everywhere. Not reported: a
  link of a sort comparator chain (`a.rank - b.rank || a.name.localeCompare(b.name)`, a `compare...`
  call), when the chain ends in another comparison rather than a literal; a bit test
  (`flags & MASK`); an operand whose `||` chain falls back to `0` (`count || 0`, `(ready && count) ||
0`), which gives the same result as `?? 0`; and a condition that is always true or always false,
  which `@typescript-eslint/no-unnecessary-condition` reports. A number on an optional parameter
  with a non-zero `||` default is also reported by `nitpicker/no-falsy-default`; the fix is the
  same. When `0` must take the same path as a missing value, add an exception for the rule. In the
  JavaScript preset the type comes from JSDoc and inference (`checkJs`); an untyped value is `any`
  and is not reported.
- `nitpicker/no-shared-stateful-regex`: a regex with the `g` or `y` flag keeps `lastIndex` between
  calls, so `test()` and `exec()` on one that is reused start where the previous call stopped and
  return order-dependent results. Reported: `test()` or `exec()` (and, for a `y` regex without `g`,
  `match()` and `replace()`) on a `g` or `y` regex held in a `const`, `let` or `var` that is never
  reassigned, a class field (also one set in the constructor, static or `#private`) or a property of
  a `const` object literal, when the call runs in another function than the one that created the
  regex (a module-level regex used in a function, a callback), inside a loop that does not create
  it, or after an earlier call in the same function that is not in another branch of the same `if`,
  `?:` or `switch`. The regex is a literal, or `RegExp` called with or without `new` and constant
  flags (`new RegExp(/x/g)` keeps the literal's flags). Not reported: a call in a loop condition,
  also after `&&` (`while ((match = pattern.exec(text)) !== null)`, which runs to the end and leaves
  `lastIndex` at 0), a call in a function that assigns `pattern.lastIndex` (before the call, as a
  sticky tokenizer does, or after it, as cleanup in `finally`), `match`, `replace`, `replaceAll`,
  `search` and `split` with a `g` regex (they reset or ignore `lastIndex`), `matchAll` (it works on
  a copy and leaves the regex as it is; the copy starts at the current `lastIndex`, so it is safe
  once nothing else advances the regex), and a regex passed in as a parameter (its flags are the
  caller's; that case was too noisy to report). A regex reached through an alias, an import or a
  getter is not followed. The `let match = pattern.exec(text); while (match) { ... }` form is
  reported for a shared regex: walk the matches with `matchAll` instead. A `g` flag that a regex
  used once in its own function does not need is `regexp/no-useless-flag` (from
  `eslint-plugin-regexp`, on for `g` and `y` only), so the two rules do not overlap. Allowed: create
  the regex where it is used, drop `g` when one match is enough, or `text.matchAll(pattern)` for
  every match.
- Regular expressions with a part that never changes what they match or does not do what it looks
  like (`eslint-plugin-regexp`, in production code). A part that can never match, always matches or repeats another part is either
  a bug or dead weight, and tests seldom reach the input that tells which: an assertion that always
  accepts or always rejects (`/a\bb/`), an alternative or quantifier an assertion rules out, a
  duplicate alternative (`/a|b|a/`) or class member (`[\w_]`), an empty group, alternative or
  lookaround, a lazy quantifier at the end of the pattern, a backreference that is always empty, a
  zero quantifier, a capturing group that captures less than it reads, a set operand that never
  changes the set, `[\b]`, a `$2` replacement with one group and a `replaceAll`/`matchAll` regex
  without `g`. Forms with a shorter equivalent are reported too, with the fix: `a{1}`, `a{2,2}`,
  `(?:a+)*`, `\w+\d*`, `(?:ab)c`, `[a]`, `[a-ab]`, `a{3}?`, `(?=(?=b))`, `a(?!\w)` (`\b`), and a
  range such as `[ -~]` whose characters are not obvious (write `[\x20-\x7E]`). The rules are the
  `regexp/` ids listed in `eslint-config/regexp/regexp-rules.mjs`. `regexp/no-super-linear-move` is
  off: it reports the common trailing trim `replace(/\/+$/u, '')` and cannot tell bounded input
  from attacker-controlled input.
- `nitpicker/no-string-as-regex` (type-aware): `match()`, `matchAll()` and `search()` compile a
  string argument as a regex, so a string-typed argument on a string receiver is reported (also a
  literal: `text.match('a.b')`); use `includes`, `startsWith`, `indexOf` or `===` for plain text, or
  pass a RegExp. It also reports a value built into the pattern of `new RegExp(...)` or `RegExp(...)`
  through a template literal, `String.raw` or `+` without escaping, when its type is a wide `string`
  (or a template literal type) and it comes from a parameter of the function: directly, through a
  local `const`, a `for...of` variable or a callback parameter of a call on such a value. Module
  constants, string literal unions, numbers, the condition of a `?:`, an escape (`RegExp.escape`, a
  function whose name contains `escape` and `reg` or `pattern` such as `escapeRegExp` or
  `_.escapeRegExp`, also passed as `names.map(escapeRegExp)`, and the inline
  `value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) and a RegExp's `.source` are not reported, and neither is a value passed as the whole pattern
  (`new RegExp(pattern)`), which is meant as one: issue #749 asked to report that form too, but on
  this repository it flagged constant-derived patterns almost only, so the rule reports values
  built into a pattern and leaves whole patterns alone. Without types (plain JavaScript without JSDoc)
  the rule sees nothing.
- `nitpicker/no-compatibility-shim`: a doc comment with a `@deprecated` tag, and an exported
  `const Old = New`, `type Old = New` or `export { New as Old }` whose target `New` is also
  exported from the same module (two public names for one thing). Generic aliases, aliases of
  imports and of non-exported declarations are not reported, so `export { callee as wrapper }` of a
  function that is not itself exported (the form `no-forwarding-wrapper` recommends) stays
  allowed. Callers of a deprecated API are reported by `@typescript-eslint/no-deprecated`. In the
  JavaScript preset the `@deprecated` tag is already rejected as an unsupported JSDoc tag, so only
  the alias form is added.
- Naive datetimes have no rule in this preset. A `Date` is a UTC instant: it has no naive form and
  the standard library has no zone-aware replacement, so a check could only match literals. Reading
  the clock is already limited by `Date.now()` and `new Date()` in `domain/`, and a clock is passed
  in as a parameter.
- No `as`, `any`, or non-null assertions.
- `undefined` only for absent values. `null` only where a library or JSON requires it.
- No comments, except doc comments (`/** ... */`) on exported declarations and the members of
  exported types. They are allowed there, never required; the Java preset follows the same rule for
  Javadoc. Tool directives are allowed, except suppressions: ESLint's `noInlineConfig` blocks
  inline disables, and `@typescript-eslint/ban-ts-comment` bans `@ts-ignore`, `@ts-expect-error`
  (with or without a description) and `@ts-nocheck`. `noInlineConfig` alone does not cover
  TypeScript suppressions. A test that a type rejects a value asserts it with Vitest's
  `expectTypeOf(fn).parameter(0).not.toExtend<Value>()`, which counts as an assertion. Coverage and
  mutation ignore comments (`istanbul ignore`, `c8 ignore`, `v8 ignore`, `Stryker disable`) are
  suppressions too: `nitpicker/no-comments` reports them, and code that truly cannot be tested
  gets a reviewed exception for that rule in `nitpicker.config.json`. Even with that exception the
  comments never take effect: the coverage run strips `istanbul`/`c8`/`v8 ignore` hints before it
  measures, and a mutant a `Stryker disable` comment would hide is reported as an enforceable
  `mutation/mutant-ignored` finding that asks for the comment to go. Code that must stay out of
  mutation testing gets an `exceptions` entry for `mutant-ignored` with its paths instead.
- Test files get the suppression half of that rule: `noInlineConfig` is on, and `eslint-disable`,
  `@ts-*`, coverage and `Stryker` comments are reported. Ordinary comments stay allowed in tests.
- A doc comment has to say something the name does not. `nitpicker/no-comments` reports a doc
  comment on an exported declaration or exported type member whose description only restates the
  name: it splits the name into words (camelCase, PascalCase, snake_case, kebab-case, digits),
  drops stopwords (`the`, `a`, `of`, `get`, `returns`, `component`, `class`, `value`...), and reports when
  every remaining description word, with a crude `ing`/`ed`/`es`/`s` stem, is a word of the name
  (`/** Gets the user name. */ getUserName`, `/** The order id */ orderId`, `/** Button component */
Button`). `@param`, `@returns` and other tag lines are not part of the description, but a tag
  with text (`@param id the account`, `@returns the login name`, `@throws {RangeError} when ...`)
  says more, so a comment with one is not reported as restating; a tag with only a name or a
  type (`@param {string} id`, `@returns {string}`) is not text. Write the
  unit, the limit, the edge case or the reason (`/** Price in cents, rounded down. */`). A
  description longer than 5 lines, tag lines, blank lines and code examples not counted (a fenced
  ` ``` ` or `~~~` block, or the body of an `@example` tag; a fence that is never closed counts as prose), is reported too; bullets and
  other prose count: keep the non-obvious point and move the rest into names and types. Both
  checks are skipped in the JavaScript preset's JSDoc mode, which already bans JSDoc prose, and a
  doc comment that is needed as written gets an exception for the rule.
