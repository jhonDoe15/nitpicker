# Async code, I/O and production rules

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- `async`/`await`, never `.then()`. No floating promises.
- Fan-out: bound concurrent remote or message calls. Run each call through a limiter created outside the loop (`pLimit(8)`, p-queue `concurrency`, Bottleneck `maxConcurrent`) or work through fixed-size chunks. RxJS: `mergeMap(fn, 8)` or `concatMap`, never `forkJoin(items.map(load))`. Never `Promise.all(items.map(send))` over a runtime collection.
- Wire clients, servers, pools and config in the composition root (`src/main/composition-root.ts`,
  `main.ts` or `server.ts`) and pass them into factories; read `process.env` only there.
- Parse untrusted input once with zod in `adapters/`; `domain/` takes readonly types it declares.
- Run programs with `execFile(command, [args])`, never a command string.
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
- Each finding names the allowed form. A deliberate exception goes in `nitpicker.config.json`
  `exceptions` (rule, paths, reason), never inline.
