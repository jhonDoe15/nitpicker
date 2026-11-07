# Async code, I/O and production rules

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `async`/`await`, never `.then()`. No floating promises.
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. RxJS: `mergeMap(fn, 8)` or `concatMap`, never `forkJoin(items.map(load))`. Never `Promise.all(items.map(send))` over a runtime collection.
- Wire clients, servers, pools and config in the composition root (`src/main/composition-root.ts`,
  `main.ts` or `server.ts`) and pass them into factories; read `process.env` only there.
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
- Regexes: a `g` or `y` regex keeps `lastIndex`, so don't reuse one with `test()` or `exec()`
  across calls; drop the flag or use `text.matchAll(pattern)` (`nitpicker/no-shared-stateful-regex`).
  `match`, `matchAll` and `search` compile a string argument as a regex: use `includes` or
  `startsWith` for text, and escape a parameter before building it into `new RegExp(...)`
  (`nitpicker/no-string-as-regex`).
- A child process you wait for gets a deadline: `{ timeout: 30_000 }` on `execFileSync`/`spawnSync`, or a
  `timeout` or `signal: AbortSignal.timeout(30_000)` on `execFile` and an awaited `spawn` or `execa`
  (`nitpicker/require-process-timeout`; a build wrapper that only runs a child to completion takes an exception).
- In a server project, dates use UTC or a named zone, never the server's own: `getUTCHours()`,
  `toISOString()`, `Date.UTC(...)`, `{ timeZone }` for `Intl.DateTimeFormat` and `toLocale*String`,
  luxon `{ zone }`, date-fns `{ in: tz(zone) }`, dayjs `.utc()` (`nitpicker/no-local-time-zone`).
- Each finding names the allowed form. A deliberate exception goes in `nitpicker.config.json`
  `exceptions` (rule, paths, reason), never inline.
- The `$schema` line of `nitpicker.config.json`
  (`"$schema": "./node_modules/nitpicker/spec/config.schema.json"`)
  lets the editor flag a misspelled key or a value the run refuses; nitpicker ignores it. Keep it
  when you edit the file.
