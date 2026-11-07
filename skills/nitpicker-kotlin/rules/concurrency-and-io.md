# Coroutines, I/O and remote calls

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Coroutines: no `GlobalScope`, no `runBlocking` (a call, however it is imported). Make the caller `suspend`
  (`suspend fun main()` for an entry point) and use `coroutineScope { launch { ... } }`; a test uses `runTest`.
- Fan-out: bound concurrent remote or message calls. One `Semaphore(8)` with `withPermit { ... }` around each call,
  `chunked(n)`, or `flatMapMerge(concurrency = n)`; never `items.map { async { client.get(it) } }.awaitAll()` over a
  runtime collection. `limitedParallelism(n)` caps threads, not suspending calls in flight. Reactor: pass a limit
  (`flatMap({ fetch(it) }, 8)`) or use `concatMap`; never `Mono.zip(items.map { fetch(it) })`.
- Child processes: wait with a deadline, `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`,
  and read the output on another thread first; never `waitFor()` or `inputStream.readBytes()` alone
  (`kotlin-source/ProcessWaitWithoutTimeout`; a build wrapper that only runs a child to completion takes an exception).
- HTTP calls: every request has a deadline. `HttpRequest.newBuilder(uri).timeout(...)`, `readTimeout` on an
  `HttpURLConnection`, Ktor's `HttpTimeout`, OkHttp; not `URL(url).readText()` or `HttpClients.createDefault()`
  (`kotlin-source/HttpWithoutTimeout`).
- A stream, reader, JAR file or connection you open is closed with `.use { }`, also one used
  once: `resource.inputStream.use { it.readBytes() }`, not `resource.inputStream.readBytes()`
  (`kotlin-source/UnclosedInlineResource`; Java sources: `pmd/UnclosedInlineResource`).
- In main code, nothing with an outside effect runs while a file, `object`, companion object or
  enum class loads (`pmd/ClassLoadEffect`): no connection, request, file access, pool, timer,
  coroutine launch or JVM-wide setting in a top-level property, an `object`'s properties or `init`,
  an enum entry, or a class its companion creates, nor in a function they call. Do the work in a
  function `main` or the framework calls after startup (a `@Bean` method, an `ApplicationRunner`, a
  Ktor module) and pass the result in, or defer it with `by lazy { }`. Constants, loggers, `Regex`
  and collections can stay.
