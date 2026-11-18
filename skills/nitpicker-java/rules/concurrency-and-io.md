# Threads, I/O and remote calls

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Threads: no `synchronized`, `wait` or `notify`. Lock with a private final `ReentrantLock`
  (`lock()` right before `try`, `unlock()` in `finally`) and wait on a `Condition` from it
  (`await()` in a loop, `signalAll()`).
- Output: no `System.out`/`System.err` and no `printStackTrace()`. Log with
  `System.getLogger(Foo.class.getName())`, or the project's logger. A command-line program takes a
  `PrintStream`, `Writer` or `Appendable` parameter and writes to it; only `static void main`
  passes `System.out`/`System.err` (`new Cli(System.out).run(args)`, `System.out::print`), and
  that hop is not a finding and needs no test; branches in `main` still count.
- Fan-out: bound concurrent remote or message calls. Run the tasks on a fixed pool
  (`Executors.newFixedThreadPool(8)`), take a `Semaphore` permit around each call, or work through
  fixed-size batches; never `supplyAsync` per element on the default pool or a cached or
  virtual-thread executor. Reactor: `flatMap(this::fetch, 8)` or `concatMap`, never
  `Flux.fromIterable(items).flatMap(this::fetch)` or `Mono.zip` over a list built per element.
- Data access: never call a repository, JDBC connection, `EntityManager` or HTTP client once per loop item
  (`ids.forEach(id -> repository.findById(id))`): fetch or write all items at once (`findAllById`, `saveAll`,
  `where id in (...)`, one batched request), `pmd/IoCallInLoop`. Paging, polling and retry loops are fine.
- Helpers count: a helper that reads or writes through a repository or client is a data access too, so
  `ids.forEach(id -> loader.load(id))` is reported (`effects/IoCallInLoop`, with the path of calls), also when the helper
  lives in another module of the build; give the helper the whole list. Writes flushed in steps
  (`if (++n % 50 == 0) { em.flush(); em.clear(); }`) and a batch filled in the loop and queried when full are fine.
- Accumulators: never rebuild a collection from itself on each step (`all = Stream.concat(all.stream(), ...).toList()`,
  `byId = new HashMap<>(byId)` in a loop); collect once, or fill one mutable collection (`effects/AccumulatorCopyInLoop`).
- Lazy relationships: read the relationship of each element of a query result only after the query fetched it
  (`@EntityGraph`, `JOIN FETCH`, `@BatchSize`, or a projection), never `invoice.getCustomer().getName()` per invoice
  of `findAll()` (`effects/LazyRelationInLoop`).
- Remote calls: make an HTTP or RPC call before a `@Transactional` method or `TransactionTemplate` starts or after it
  commits, and never while holding a lock (`synchronized`, `ReentrantLock`): copy what you need out of the lock first
  (`effects/RemoteCallInTransaction`, `effects/RemoteCallUnderLock`).
- Retries: a call that retries (`@Retryable`, `RetryTemplate`, Failsafe, a retry loop) writes idempotently: a Stripe
  idempotency key, an upsert, a message deduplication id, or retry only the read (`effects/RetryWithoutIdempotency`).
- Database and broker: never write a row and publish a message in one method; write the message to an outbox table in
  the same transaction and let a relay publish it (`effects/DualWriteWithoutOutbox`).
- Check, then write: when a read decides a write (`if (users.existsByEmail(e)) throw ...; users.save(...)`, a count
  against a limit, `findByEmail(e).orElseGet(() -> users.save(...))`), make it atomic: read with `@Lock` inside a
  transaction, a `@Version` column, an upsert or a unique constraint (`effects/CheckThenWriteWithoutLock`). Two or more
  repository writes in one public method need `@Transactional` (`pmd/SpringMultiWriteWithoutTransaction`).
- GraphQL fields: a `@SchemaMapping` or `@DgsData` resolver of a non-root type runs once per parent, so it never calls
  a repository or client itself; use `@BatchMapping` or a `DataLoader` (`effects/GraphqlFieldPerParent`).
- Reactive pipelines: never look up each element of a list inside `Flux.fromIterable(items).flatMap(...)`; fetch all
  elements with one call and join in memory (`effects/ReactiveLookupPerElement`).
- Bulk changes: never load rows only to set the same value on each and save them, or to delete them; use one
  `@Modifying @Query` update or delete, or `deleteAllInBatch` (`effects/RowsChangedInMemory`).
- Reads: never load whole entities to read one column (`findByTeam(id).stream().map(User::getEmail)`; select a
  projection) or to test existence (`countByEmail(e) > 0`, `findByEmail(e).isPresent()`; use `existsByEmail`)
  (`effects/EntityLoadedForOneColumn`, `effects/EntityLoadedForExistence`).
- Optimistic-lock retries: read the row by id and apply the change inside the retried scope (`Mono.defer`, the loop
  body, or a `@Retryable` method that takes the id); never resend the object that conflicted (`effects/RetryWithStaleObject`).
- Async methods: do not return `immediateFuture`/`completedFuture` of a database or HTTP call made on the calling thread
  (submit it to an executor or make the method synchronous), and do not wait with `.get()`/`.join()` on `fooAsync()` when
  `foo()` exists (`effects/AsyncMethodDoesBlockingWork`, `effects/WaitOnAsyncTwin`).
- Jobs: in a `@Scheduled` method, a batch `@KafkaListener`, a `@SqsListener` or a Quartz `execute`, catch the failure of
  each item inside the loop and record it (or enqueue one job per item), so one failing item does not skip the rest
  (`effects/JobLoopWithoutItemIsolation`).
- Soft delete: a read of an entity with a `deletedAt`, `deleted` or `archived` flag repeats the condition the project's
  other reads use, or the entity carries `@SQLRestriction` (or `@Where`, `@FilterDef`)
  (`effects/SoftDeleteFilterMissing`).
- Soft delete in memory: a loop or stream over an entity's collection (`basket.getItems()`) skips the deleted items the
  way the project's other loops do, or the collection carries `@SQLRestriction`, `@Where` or `@Filter`
  (`effects/DeletedItemInMemory`).
- Auth: a route handler carries the authorization annotation the project's other handlers carry, on the method or the
  controller (`effects/HandlerWithoutAuth`).
- A `CompletableFuture` that a listener completes is completed exceptionally on the failure path too
  (`client.onFailure(reply::completeExceptionally)`), or comes from an API that returns one itself, such as
  `CompletableFuture.supplyAsync(task, executor)` (`pmd/FutureWithoutException`).
- A `close()`, `@AfterEach` or `@PreDestroy` method that releases several resources uses one try-with-resources or
  `try`/`finally` per release, never `a.close(); b.close();` in sequence (`pmd/CleanupSkippedOnFailure`).
- A `close()` that clears a map of pending futures completes every entry first
  (`pending.values().forEach(f -> f.completeExceptionally(...))`), so no caller waits forever
  (`pmd/PendingFuturesNotFailedOnClose`).
- A class that creates a `ScheduledExecutorService` or `Timer` shuts it down in `close()` (`shutdown()` then
  `awaitTermination`, or `cancel()`), `pmd/TimerNotStoppedOnClose`.
- A concurrent map whose values are collections stores concurrent values
  (`map.computeIfAbsent(key, k -> ConcurrentHashMap.newKeySet()).add(item)`) or changes them inside `compute`
  or `merge`, never a plain `HashSet` or `ArrayList` changed after `computeIfAbsent` returns it
  (`pmd/PlainCollectionInConcurrentMap`).
- A plain `HashMap`, `ArrayList` or `HashSet` field that a class changes from an executor, scheduler or
  `CompletableFuture` task, or in one method while another changes it under `synchronized`, is a concurrent
  collection (`ConcurrentHashMap`, `CopyOnWriteArrayList`) or is locked on every read and write
  (`pmd/UnsynchronizedSharedCollection`).
- A concurrent map is not checked and then used again for the same key (`containsKey` then `put` or `get`,
  `get(k) == null` then `put`): use `computeIfAbsent`, `putIfAbsent`, `getOrDefault`, or read once into a local
  (`pmd/ConcurrentMapCheckThenAct`).
- A `static` field or a singleton bean's field does not hold a `SimpleDateFormat`, `DecimalFormat`, `Calendar`,
  `Matcher`, `Cipher`, `Mac`, `BeanWrapper` or retry back-off: use `DateTimeFormatter`, a `Pattern` constant with
  `pattern.matcher(text)` per call, a per-call instance or a `ThreadLocal` (`pmd/SharedStatefulHelperField`).
- A singleton bean, servlet or filter does not store a value built from a call's argument in an instance field
  (`this.currency = requestedCurrency` in a service method): keep it in a local, key it by caller in a concurrent
  map, or use a prototype-scoped bean (`pmd/CallValueStoredInSharedField`).
- A Netty `ByteBuf` that a method allocates, retains or encodes is released in a `finally` (`buf.release()`) or handed
  on (returned, stored, `ctx.write(buf)`, `out.add(buf)`), never only read and dropped (`pmd/BufferNeverReleased`).
- A `CompletableFuture` field returned on later calls is reset when the attempt fails
  (`whenComplete`, or `AtomicReference.compareAndSet(future, null)`), `pmd/CachedFutureKeepsFailure`.
- A `Map`, `Set` or `List` field of a singleton bean that a method adds to per request is removed from when the
  request ends, or is a bounded cache (`pmd/UnboundedCollectionField`).
- Child processes: wait with a deadline and destroy the child when it runs over,
  `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`, reading the output on
  another thread first; never `waitFor()` or `getInputStream().readAllBytes()` alone
  (`pmd/ProcessWaitWithoutTimeout`; a build wrapper that only runs a child to completion takes an exception).
- Waits for other work have a deadline: `future.get(30, TimeUnit.SECONDS)`, `latch.await(30, TimeUnit.SECONDS)`,
  `thread.join(30_000)`, `future.orTimeout(30, TimeUnit.SECONDS).join()`, and `mono.block(Duration.ofSeconds(30))`
  (also `blockOptional`, `blockFirst`, `blockLast`); never the no-argument form
  (`pmd/UnboundedWait`, `pmd/ReactorBlockWithoutTimeout`; a command's `main` that waits for its work takes an exception).
- HTTP calls: every request has a deadline. `HttpRequest.newBuilder(uri).timeout(...)`,
  `setReadTimeout` on an `HttpURLConnection`, `setDefaultRequestConfig(...)` on an Apache client
  builder, `readTimeout` on a JAX-RS `ClientBuilder`; not `URL.openStream()` or
  `HttpClients.createDefault()` (`pmd/HttpWithoutTimeout`).
- Pages of rows: a query that takes a page (`setMaxResults`, `setFirstResult`, `limit`, `offset`, an
  unsorted `PageRequest` passed to `findAll`) or builds an `array_agg`/`json_agg` list orders on a unique key:
  `order by a.createdAt desc, a.id`, `criteria.orderBy(...)`, `PageRequest.of(page, size, Sort.by("createdAt", "id"))`
  (`pmd/UnorderedQuery`).
- A list bound into a query (`setParameter("ids", ids)`, `findAllById(ids)`, `MapSqlParameterSource`) has an
  empty check first and goes in chunks (`Lists.partition(ids, 1000)`), or goes as one array parameter
  (`id = any(:ids)`): an empty list renders `in ()` and PostgreSQL takes at most 65,535 bound parameters
  (`pmd/UnboundedQueryArray`).
- Build shareable objects once: an `ObjectMapper`, `Gson`, `JAXBContext`, `ValidatorFactory` or
  `DateTimeFormatter.ofPattern("...")` goes in a `static final` constant, a final field or a `@Bean`,
  not inside a method that runs per call (`pmd/ReusableObjectPerCall`).
- Database queries have a deadline: with a database server in `spring.datasource.url`, set
  `spring.jpa.properties.jakarta.persistence.query.timeout`, `spring.transaction.default-timeout`,
  `spring.jdbc.template.query-timeout` or a driver `socketTimeout` (`spring/datasource-without-timeout`).
- Resources: try-with-resources for anything `Closeable`, also one used once: not
  `resource.getInputStream().readAllBytes()` or `load(new JarFile(root))`
  (`pmd/UnclosedInlineResource`). No `finally` that returns or throws.
- In main code, nothing with an outside effect runs while a class loads (`ClassLoadEffect`): no
  connection, request, file access, thread, pool, sleep or JVM-wide setting in a `static` field or
  block, an enum constant, or the constructor or initializer of a `static final INSTANCE = new X()`
  singleton, nor in a method of the class they call. Do the work in a method `main` or the
  framework calls after startup (a `@Bean` method, an `ApplicationRunner`) and pass the result in,
  or create it on first use in a lazy holder
  (`private static final class Holder { static final Db INSTANCE = new Db(); }`). Constants,
  loggers, `Pattern.compile` and collections stay static.
