# Coroutines, I/O and remote calls

Part of the [nitpicker-kotlin](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Coroutines: no `GlobalScope`, no `runBlocking` (a call, however it is imported). Make the caller `suspend`
  (`suspend fun main()` for an entry point) and use `coroutineScope { launch { ... } }`; a test uses `runTest`.
  Cleanup in `finally` (or after `catch (CancellationException)`) that suspends must run as
  `withContext(NonCancellable) { withTimeout(5.seconds) { ... } }`, or be a plain blocking `close()`. Do not start
  `scope.launch { ... }` from `x.use { }` with an outer scope while the child reads `x`: use `coroutineScope { }`
  in the block, `join()` the launched job before it ends (not under an `if`), or open the resource inside the
  child (`scope.launch { open().use { ... } }`).
- A timeout stops waiting, not the work (`pmd/timeout-abandons-operation`): start the work inside
  `withTimeout(ms) { ... }`, or catch `TimeoutCancellationException` and `cancel()` the `Deferred`
  before rethrowing. `future.get(1, SECONDS)` needs `cancel(true)` on that future or a rethrow in
  its `TimeoutException` handler; a `supplyAsync` future never interrupts its task (`get`, `orTimeout`
  or `cancel(true)`), so run that work as a coroutine or on an `ExecutorService`.
- Do not wrap suspending work in `runCatching`: it captures cancellation. Call directly or catch
  only an expected specific failure. Non-suspending `runCatching` is allowed.
- In a suspend function or coroutine, a `catch` of `CancellationException` rethrows it (`throw e`) or calls
  `ensureActive()`; a `catch` of `InterruptedException` rethrows or calls `Thread.currentThread().interrupt()`.
  Logging or returning a default swallows it (`pmd/SwallowedCancellation`, `pmd/SwallowedInterrupt`).
- Inject a dispatcher (`dispatcher: CoroutineDispatcher = Dispatchers.IO`) instead of naming `Dispatchers.IO`
  in main code; no `suspend` on a function that never suspends or returns a `Flow`; no `suspend`
  `CoroutineScope` extension; `delay`, never `Thread.sleep`, in a `suspend` function.
- Fan-out: bound concurrent remote or message calls. One `Semaphore(8)` with `withPermit { ... }` around each call,
  `chunked(n)`, or `flatMapMerge(concurrency = n)`; never `items.map { async { client.get(it) } }.awaitAll()` over a
  runtime collection. `limitedParallelism(n)` caps threads, not suspending calls in flight. Reactor: pass a limit
  (`flatMap({ fetch(it) }, 8)`) or use `concatMap`; never `Mono.zip(items.map { fetch(it) })`.
- Helpers count: a helper that reads or writes through a repository or client is a data access too, so
  `ids.forEach { loader.load(it) }` is reported (`effects/IoCallInLoop`, with the path of calls); give the helper the
  whole list.
- Accumulators: never rebuild a collection from itself on each step (`acc + x` in `fold`, `reduce` or a loop,
  `acc += x` on a `var` read-only list); use `map`, `flatMap`, `buildList` or one mutable collection
  (`effects/AccumulatorCopyInLoop`).
- Lazy relationships: read the relationship of each element of a query result only after the query fetched it
  (`@EntityGraph`, `JOIN FETCH`, `@BatchSize`, or a projection), never `invoices.map { it.customer.name }` over
  `findAll()` (`effects/LazyRelationInLoop`).
- Remote calls: make an HTTP or RPC call before a `@Transactional` function or `transactionTemplate.execute { }`
  starts or after it commits, and never inside `withLock { }`, `synchronized` or a `Mutex`: copy what you need out
  first (`effects/RemoteCallInTransaction`, `effects/RemoteCallUnderLock`).
- Retries: a call that retries (`@Retryable`, `RetryTemplate`, resilience4j, `repeat(n) { try { ... } }`) writes
  idempotently: a Stripe idempotency key, an upsert, a message deduplication id, or retry only the read
  (`effects/RetryWithoutIdempotency`).
- Build shareable objects once: an `ObjectMapper`, `jacksonObjectMapper()`, `Json { }`, `Gson`, a
  `Regex("...")` or `DateTimeFormatter.ofPattern("...")` goes in a property, a companion or `by lazy`, not inside
  a function that runs per call (`pmd/ReusableObjectPerCall`).
- A continuation or future that a callback resumes also gets the failure path: `continuation.resumeWithException(error)`
  or `deferred.completeExceptionally(error)` from the error callback, or a suspending API that throws by itself
  (`kotlin-source/FutureWithoutException`).
- A `close()`, `@AfterEach` or `@PreDestroy` function that releases several resources uses `use` or `try`/`finally`
  per release, never `a.close()` then `b.close()` in sequence (`kotlin-source/CleanupSkippedOnFailure`).
- A `close()` that clears a map of pending `CompletableDeferred` or futures completes every entry first
  (`pending.values.forEach { it.completeExceptionally(...) }`), so no caller waits forever
  (`kotlin-source/PendingFuturesNotFailedOnClose`).
- A class that creates a scheduled executor or `Timer` shuts it down in `close()`
  (`kotlin-source/TimerNotStoppedOnClose`).
- A `Deferred` or future kept in a property is reset on failure (`invokeOnCompletion { if (conn === attempt) conn = null }`),
  and never wrapped in `by lazy` (`kotlin-source/CachedDeferredKeepsFailure`).
- A `Map`, `Set` or `List` property of a singleton bean that a function adds to per request is removed from when the
  request ends, or is a bounded cache (`kotlin-source/UnboundedCollectionProperty`).
- Child processes: wait with a deadline, `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`,
  and read the output on another thread first; never `waitFor()` or `inputStream.readBytes()` alone
  (`kotlin-source/ProcessWaitWithoutTimeout`; a build wrapper that only runs a child to completion takes an exception).
- Waits for other work have a deadline: `future.get(30, TimeUnit.SECONDS)`, `latch.await(30, TimeUnit.SECONDS)`,
  `thread.join(30_000)`, `future.orTimeout(30, TimeUnit.SECONDS).join()`, and `mono.block(Duration.ofSeconds(30))`
  (also `blockOptional`, `blockFirst`, `blockLast`); never the no-argument form
  (`kotlin-source/UnboundedWait`, `kotlin-source/ReactorBlockWithoutTimeout`; a command's `main` that waits for its work
  takes an exception).
- A coroutine started on a scope you build (`CoroutineScope(...)`, `MainScope()`) handles its failure: put a
  `CoroutineExceptionHandler` in the scope's context, or catch and log in the block, and await every `async`
  (`kotlin-source/UnhandledRootCoroutine`).
- HTTP calls: every request has a deadline. `HttpRequest.newBuilder(uri).timeout(...)`, `readTimeout` on an
  `HttpURLConnection`, Ktor's `HttpTimeout`, OkHttp; not `URL(url).readText()` or `HttpClients.createDefault()`
  (`kotlin-source/HttpWithoutTimeout`).
- Pages of rows: a query that takes a page (`setMaxResults`, `setFirstResult`, `limit`, `offset`, an unsorted
  `PageRequest` passed to `findAll`) or builds an `array_agg`/`json_agg` list orders on a unique key:
  `order by a.createdAt desc, a.id`, `PageRequest.of(page, size, Sort.by("createdAt", "id"))`
  (`kotlin-source/UnorderedQuery`; Java sources: `pmd/UnorderedQuery`).
- A list bound into a query (`setParameter("ids", ids)`, `findAllById(ids)`) has an empty check first and goes in
  chunks (`ids.chunked(1000)`), or goes as one array parameter (`id = any(:ids)`): an empty list renders `in ()`
  and PostgreSQL takes at most 65,535 bound parameters (`kotlin-source/UnboundedQueryArray`).
- Database queries have a deadline: with a database server in `spring.datasource.url`, set
  `spring.jpa.properties.jakarta.persistence.query.timeout`, `spring.transaction.default-timeout`,
  `spring.jdbc.template.query-timeout` or a driver `socketTimeout` (`spring/datasource-without-timeout`).
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
