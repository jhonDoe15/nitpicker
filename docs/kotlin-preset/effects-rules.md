# Effects rules

Part of the [Kotlin preset guide](../kotlin-preset.md).

The Java preset's [effects rules](../java-preset/effects-rules.md) run on the compiled Kotlin classes
too, under the tool `effects` (exception `effects/<Rule>`), so receivers resolve by their type and
helpers by what they call (#435, #329).

| Rule                      | Reports                                                                                                                                                                                                                                                                                                                                                                                      | Allowed form                                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IoCallInLoop`            | a `database` or `remote` call per loop item, direct (`repository.deleteById(id)`, `repository.findByIdOrNull(id)`) or through a project helper, in a `for`, `while` or `do` body or an inlined iterating lambda (`forEach`, `map`, `filter` and the rest compile to real loops), a `Sequence` step; a `database` call inside `map { async { ... } }` and the other concurrent per-item forms | a batch call for all items (`findAllById`, `saveAll`); for remote calls without a batch endpoint, `Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)`                              |
| `AccumulatorCopyInLoop`   | `fold`, `reduce`, `runningFold` and loops whose step stores `acc + x` (`CollectionsKt.plus`, `SetsKt.plus`, `MapsKt.plus`, `toMutableList()` and the other copies) of the accumulator back into it, also `acc += x` on a `var` read-only collection (#440)                                                                                                                                   | `map`, `flatMap`, `associate`, `groupBy`, `buildList`, or one mutable collection filled in the loop                                                                                                                             |
| `LazyRelationInLoop`      | a lazy JPA relationship (a constructor property such as `@ManyToOne(fetch = FetchType.LAZY) val customer: Customer` or `@OneToMany val lines: List<Line>`) read on each element of a repository or `EntityManager` query result and then used, in a `for` loop, an inlined `map`/`forEach`/`sumOf` or a `Sequence` step (`invoices.findAll().map { it.customer.name }`) (#314)               | `@EntityGraph(attributePaths = ["customer"])` or a named entity graph on the repository method, `JOIN FETCH` in the query, `@BatchSize`, `@Fetch(FetchMode.SUBSELECT)` or `hibernate.default_batch_fetch_size`, or a projection |
| `RemoteCallInTransaction` | a `remote` call, direct or through helpers, in a `@Transactional` function, a `transactionTemplate.execute { }` or `executeWithoutResult { }` block or an Exposed `transaction { }` that also uses the database (#317)                                                                                                                                                                       | the remote call before the transaction or after it commits, or an outbox row sent by a worker                                                                                                                                   |
| `RemoteCallUnderLock`     | a `remote` call, direct or through helpers, inside `lock.withLock { }`, `mutex.withLock { }`, `synchronized(lock) { }`, a `@Synchronized` function, between `lock()` and the last `unlock()` of the same lock, or under a `Semaphore(1)` permit; an early `return` inside the block does not end it, and a `Semaphore` with more permits is a bound, not a lock (#317)                       | read what the call needs under the lock, release it, call, and lock again to apply the result; a fill-once block (`if (cached != null) return cached` before the call that sets it) is allowed                                  |
| `RetryWithoutIdempotency` | a Stripe `create` without an idempotency key, a `message` publish without a deduplication id, or a constant plain `INSERT`, direct or through helpers, in a `@Retryable` or `@Retry` function, a resilience4j or `RetryTemplate` block, or a `repeat(n) { try { ...; return } catch ... }` loop (#318)                                                                                       | a stable idempotency key, a deduplication id, an upsert, or retrying only the read                                                                                                                                              |
| `DualWriteWithoutOutbox`  | a function that writes to the database and, at another call, publishes a message, also through `publisher.publishEvent(...)` to an `@EventListener` or `@TransactionalEventListener` (#322)                                                                                                                                                                                                  | an outbox row in the same transaction, published by a relay                                                                                                                                                                     |

On Maven the engine reads the module's compiled classes (the `kotlin-maven-plugin` output in `target/classes`)
the same way, so a Kotlin module reports what the same sources report on Gradle.

`IoCallInLoop` replaced the source check `kotlin-source/IoCallInLoop`. An exception written for
that one keeps working for now: nitpicker reads `kotlin-source/IoCallInLoop` in
`nitpicker.config.json` as `effects/IoCallInLoop` and prints a notice asking to rename it. When a
project first runs the effects rules, or upgrades to a release that names methods as the source
does (`Outer.Companion.load`, a lambda by its enclosing function), its findings get new identities
once; base and head are analyzed by the same release, so this creates no new findings in a review.
Iterating callbacks include the `Sequence` steps, `sortedWith`, `compareBy`, and the `Flow`
operators that run per element (`onEach`, `collect`, `collectLatest`, `mapLatest`, `flatMapConcat`,
`flatMapLatest`, `scan` and the like); `flatMapMerge` is a concurrent form, like `async`. A
`launch`, `Thread`, scheduled task or listener callback runs later and is not part of the loop.
Paging and polling loops, retries (`repeat(3) { try {
return ... } catch ... }`), batch methods, chunk calls (`ids.chunked(100).forEach {
loader.forget(it) }`), file calls and `message` publishes are not reported, as in the Java preset;
a line a Spring Data loop rule reports is not reported again.

`LazyRelationInLoop` follows the
Java rule: the list must come from a query in the same function, `it.customer.id` alone never
loads, and a configured `hibernate.default_batch_fetch_size` turns it off.
