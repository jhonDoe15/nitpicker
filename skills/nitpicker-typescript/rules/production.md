# Async code, I/O and production rules

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `async`/`await`, never `.then()`. No floating promises.
- A timeout does not stop the work it races: `Promise.race([op(), rejectAfter(ms)])` leaves `op` running
  (`timeout-abandons-operation`). Give `op` the `AbortSignal` the timeout aborts (`{ signal: controller.signal }`,
  or `AbortSignal.timeout(ms)` straight to an API that takes `signal`) and drop the race.
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. RxJS: `mergeMap(fn, 8)` or `concatMap`, never `forkJoin(items.map(load))`. Never `Promise.all(items.map(send))` over a runtime collection.
- Wire clients, servers, pools and config in the composition root (`src/main/composition-root.ts`,
  `main.ts` or `server.ts`) and pass them into factories; read `process.env` only there.
- Print through a `{ write(text: string): void }` parameter. Only the composition root
  (or a `layout.entryPoints` file) names `process.stdout` / `process.stderr` and passes them in;
  `console.*` is a finding everywhere.
- Parse untrusted input once with zod in `adapters/`; `domain/` takes readonly types it declares.
- Run programs with `execFile(command, [args])`, never a command string.
- Parse a URL from runtime text with `URL.parse(text)` or after `URL.canParse(text)`; `new URL(text)`
  throws on text that is not a URL (`nitpicker/no-unhandled-url-parse`).
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
- In a server project, dates use UTC or a named zone, never the server's own: `getUTCHours()`,
  `toISOString()`, `Date.UTC(...)`, `{ timeZone }` for `Intl.DateTimeFormat` and `toLocale*String`,
  luxon `{ zone }`, date-fns `{ in: tz(zone) }`, dayjs `.utc()` (`nitpicker/no-local-time-zone`).
- Let the database count, filter, sort and aggregate: `count`/`exists`/`findFirst` instead of
  `(await repo.find()).length`, `where` instead of `.filter`/`.some`/`.find` on the rows, `order`/`orderBy`
  instead of `.sort`, and the ORM's aggregate or `groupBy` instead of `reduce`, `Math.max(...rows.map(...))`
  or `groupBy` (`nitpicker/no-in-memory-query`).
- Each finding names the allowed form. A deliberate exception goes in `nitpicker.config.json`
  `exceptions` (rule, paths, reason), never inline.
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "./node_modules/nitpicker/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
