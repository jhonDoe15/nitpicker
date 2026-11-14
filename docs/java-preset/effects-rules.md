# Effects rules

Part of the [Java preset guide](../java-preset.md).

The `effects` tool reads the compiled main classes of every module, with the module's compile
classpath for supertypes, and reports what source patterns cannot see: I/O reached through the
project's own helpers (#435). It runs on
Gradle (`nitpickerEffects`) and Maven alike, and in the Kotlin preset on the Kotlin classes too ([Kotlin effects rules](../kotlin-preset/effects-rules.md)).
The engine (`languages/java/gradle/effects/`, built on ASM, BSD-3-Clause) is compiled with
`--release 17` by a JDK 17 or newer: the JVM that runs Gradle when it is new enough, else a JDK 17
toolchain (the same lookup as the Checkstyle launcher); on Maven the project's JDK (`JAVA_HOME` or
the `java` on the `PATH`) when it is new enough, else a JDK 17 or newer found in the versioned
`JAVA_HOME_<N>_X64` variables, `~/.m2/toolchains.xml`, SDKMAN or the system JDK directories. When
there is none, the run does not fail: the engine writes `{ "unavailable": ... }` and nitpicker
prints an `effects/effects-unavailable` notice saying its rules did not run. Class files the engine cannot read (newer than its ASM release) are counted
in `effects.json` (`skipped` for the module's classes, `unreadableLibraries` for the classpath) and
named in an `effects/effects-skipped-classes` notice; a module whose classes it could read none of
fails the run. A method with more than 30,000 instructions or 64 loops is not analyzed (its loops
would make the data-flow analysis cubic), and the engine stops analyzing after a time budget (240
seconds, the `timeBudgetSeconds` effects option): the report counts both under `degraded` and an
`effects/effects-degraded` notice names them, so a large module is checked in part rather than
failing. When 3 or more, and at least a tenth, of the parent types of the module's classes are on
no classpath entry (`unresolved` in the report), an `effects/effects-classpath-incomplete` notice
says the engine may miss clients and entities behind them. Each module is analyzed on its own, but
a helper in another module of the same build is followed: the class directories and jars of the
build's other modules on the module's compile classpath (Gradle project dependencies, Maven reactor
modules) are read as code for the helper kinds, never reported on, so
`loader.load(id)` per item reports whether `load` is in this module or the next one. A library
outside the build is seen through its classpath only, so its kind comes from the clients it
declares (a library interface annotated as a Feign, Spring HTTP interface or Retrofit client is
`remote`), not from its body. A call has a kind when its receiver's type, through its supertypes, is a known
client:

- `database`: Spring Data repositories (and their Kotlin extensions such as `findByIdOrNull`),
  `EntityManager` and JPA queries, JDBC `Statement`, `JdbcOperations`, `NamedParameterJdbcOperations`,
  `JdbcClient`, jOOQ `DSLContext` and records, Hibernate sessions and queries, `MongoOperations` and
  `MongoCollection`, Spring Data Redis operations, R2DBC `DatabaseClient`, Exposed, DynamoDB,
  MyBatis `SqlSession` and `@Mapper` interfaces, QueryDSL `fetch*`, the Neo4j driver `run`, the
  Cassandra `CqlSession` `execute`, Elasticsearch clients and Spring Data Elasticsearch operations;
- `remote`: `RestOperations`, `RestClient`, `WebClient`, `java.net.http.HttpClient`, OkHttp,
  Apache HttpClient 4 and 5, Feign, Spring HTTP interface and Retrofit interfaces of the project,
  Retrofit `Call.execute`/`enqueue`, JAX-RS `Invocation` and `SyncInvoker`, the Elasticsearch low-level `RestClient`,
  gRPC stubs, Ktor's `HttpClient`, every other AWS SDK v2 client;
- `message`: `KafkaOperations`, Kafka `Producer`, `AmqpTemplate`, RabbitMQ `Channel.basicPublish`,
  `JmsOperations`, JMS producers, `StreamBridge`, SQS and SNS clients and templates, Pub/Sub
  publishers, NATS publishes.

A project method has the kinds of the calls in its body, its lambdas and its anonymous classes,
plus those of the project methods it calls (a fixed point, so `loadOrder()` that calls
`orderRepository.findById()` is a `database` helper, and so is its caller); an interface or
abstract method has a kind when every project implementation has it
(#426). File system calls have no kind. Each
message names the path, as in "calls `OrderLoader.load()`, which calls `OrderRepository.findById()`",
leads with the allowed form, and ends with the exception route
`{ "rule": "effects/<Rule>", "paths": [...], "reason": "..." }`, where `<Rule>` is one of
`IoCallInLoop`, `AccumulatorCopyInLoop`, `LazyRelationInLoop`, `RemoteCallInTransaction`, `RemoteCallUnderLock` and `RetryWithoutIdempotency`. A finding's
identity is its rule, file, method and call path; a method is named as the source names it
(`Outer.Inner.method`, a lambda by its enclosing method).

| Rule                      | Reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Allowed form                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IoCallInLoop`            | a call whose kind is `database` or `remote`, on a client or through a project helper, once per loop item: in a `for`, `while` or `do` body, in an iterating callback (`forEach`, `map`, `filter`, `flatMap`, `peek`, `reduce`, `sorted`, `min`, `max`, `collect` and the other `Stream` steps, `Iterable.forEach`, `Iterator.forEachRemaining`, `Map.forEach`, `removeIf`, `replaceAll`, `Collectors.toMap`/`groupingBy` and the other collectors that take a function, `Comparator.comparing`, `Arrays.setAll`/`sort`, Kotlin sequence steps and `compareBy`), also as a method reference (`ids.forEach(loader::load)`); a `database` call also inside a concurrent per-item form (`parallelStream()`, `parallel()`, `CompletableFuture.supplyAsync`/`runAsync` joined in the method, an executor `submit`/`execute`/`invokeAll`/`invokeAny`, `StructuredTaskScope.fork`, Kotlin `async`/`launch`, `Flow.flatMapMerge`) | a batch call for all items (`findAllById`, `saveAll`, `WHERE id IN (...)`, a helper that takes the list); for remote calls without a batch endpoint, a bounded executor or a `Semaphore`                                                                                                                                                                                                                                    |
| `AccumulatorCopyInLoop`   | a loop that reassigns a local from a copy of itself (`all = Stream.concat(all.stream(), Stream.of(x)).toList()`, `byId = new HashMap<>(byId)`, `List.copyOf`, `Arrays.copyOf`, Guava `copyOf`, `newArrayList`, `ImmutableList.builder().addAll(acc)`), on every iteration (a copy behind an `if` in the loop, such as amortized growth `if (size == values.length) values = Arrays.copyOf(values, size * 2)`, is not reported), and a `Stream.reduce` accumulator that returns such a copy of its accumulator ([#440](https://github.com/jhonDoe15/nitpicker/issues/440))                                                                                                                                                                                                                                                                                                                                                | `collect(Collectors.toList())`, `toMap`, `groupingBy`, `flatMap`, or one mutable collection filled in the loop                                                                                                                                                                                                                                                                                                              |
| `LazyRelationInLoop`      | a lazy JPA relationship read on each element of a query result, in a loop or an iterating callback, and then used (`invoice.getCustomer().getName()`, `invoice.getLines().size()`): `@OneToMany` and `@ManyToMany` unless `fetch = EAGER`, `@ManyToOne` and `@OneToOne` with `fetch = LAZY`, on a field or getter of an `@Entity` or `@MappedSuperclass`; the list comes from a Spring Data repository query method (`findAll`, `findAllById`, derived and `@Query` methods) or `EntityManager.createQuery(...)`/`createNamedQuery`/`createNativeQuery(...).getResultList()` in the same method, directly or through `stream()`, `filter`, `sorted` and similar steps ([#314](https://github.com/jhonDoe15/nitpicker/issues/314))                                                                                                                                                                                        | fetch it with the query: `@EntityGraph(attributePaths = "customer")` (or a named entity graph that names it) on the repository method, `JOIN FETCH i.customer` in the `@Query` or JPQL text; batch the loads with `@BatchSize` on the relationship or the target entity, `@Fetch(FetchMode.SUBSELECT)`, or `hibernate.default_batch_fetch_size`; or select a projection                                                     |
| `RemoteCallInTransaction` | a `remote` call, direct or through project helpers, inside a transaction that also uses the database (a `database` call in the same scope proves a connection is held; a bare annotation is not enough): a `@Transactional` method (Spring or Jakarta, on the method or, for public methods, on the class, unless `propagation` is `NOT_SUPPORTED` or `NEVER`), a `TransactionTemplate`/`TransactionOperations` `execute` or `executeWithoutResult` callback, an Exposed `transaction {}`, or the code between `Connection.setAutoCommit(false)` and `commit()`/`rollback()` ([#317](https://github.com/jhonDoe15/nitpicker/issues/317))                                                                                                                                                                                                                                                                                 | the remote call before the transaction starts or after it commits; when its side effect must match the transaction's outcome, an outbox row written in the transaction and sent by a worker                                                                                                                                                                                                                                 |
| `RemoteCallUnderLock`     | a `remote` call, direct or through project helpers, while a lock is held: a `synchronized` method or block, from `Lock.lock()`/`lockInterruptibly()`/`tryLock()` to the last `unlock()` of the same lock (`ReentrantLock`, read/write locks, Redisson `RLock`, Kotlin `withLock`), a kotlinx `Mutex`, or a `Semaphore` created with one permit; an early `return` inside the block does not end the scope, and a `Semaphore` with more permits is a concurrency bound, not a lock ([#317](https://github.com/jhonDoe15/nitpicker/issues/317))                                                                                                                                                                                                                                                                                                                                                                            | read what the call needs under the lock, release it, make the call, and take the lock again to apply the result; a fill-once block (the call under an `if` that tests the state the block then sets, as in `if (cached == null) cached = load()`, or the lambda of `computeIfAbsent`/`compute`/`merge` on a field map) is allowed; a bare `tryLock()` that skips the work when taken is a single-run guard, not a held lock |
| `RetryWithoutIdempotency` | a write that is not idempotent, direct or through project helpers, inside a retry scope: a Stripe `create` without `RequestOptions` carrying `setIdempotencyKey`, a `message` publish without a deduplication id (SQS and SNS FIFO `messageDeduplicationId` pass; Kafka, AMQP, JMS, Pub/Sub and NATS do not), or constant SQL text starting with `INSERT` without `ON CONFLICT`, `ON DUPLICATE KEY`, `INSERT IGNORE` or `INSERT OR IGNORE/REPLACE` sent through a database call; retry scopes are `@Retryable` (Spring Retry, Spring Framework 7) and resilience4j `@Retry` methods, lambdas passed to resilience4j `Retry.decorate*`/`execute*`, `RetryTemplate.execute` and Failsafe executors whose policies include a `RetryPolicy` (a circuit breaker alone does not retry), and the attempts of a hand-written retry loop ([#318](https://github.com/jhonDoe15/nitpicker/issues/318))                              | a stable idempotency key derived from the request, a provider deduplication id, an upsert, or retrying only the read                                                                                                                                                                                                                                                                                                        |

`IoCallInLoop` here is the type-resolved half of the PMD rule of the same name
(#328): it also reports direct calls on
clients whose method names PMD's name list does not match (a Feign interface, OkHttp
`newCall(request).execute()`, a gRPC stub). A finding on a line that PMD's `IoCallInLoop` or a
Spring Data loop rule (`SpringDataNoSaveInLoop`, `SpringDataRowWriteInLoop`,
`SpringDataSaveInLoopHelper`, `SpringDataNoFlush`) already reports is dropped
(`withoutCoveredLines` in `languages/java/adapters/effects/effects-findings.mjs`); the engine
reports a call with the lines of its receiver chain, so a chain that PMD reports at its first line
counts once. The drop happens before exceptions apply, so an exception for the covering rule on
that path (`pmd/IoCallInLoop`, `pmd/SpringDataNoSaveInLoop`) covers the line for both tools. The
engine also records each direct call it classifies (`covered` in `effects.json`): a `message`
call, a non-database call in a concurrent per-item form, a batch method or a call in a callback
that runs later is exempt, and PMD's `IoCallInLoop` finding on a line with only exempt calls is
dropped, so a Kafka `send` per item or a `parallelStream()` of HTTP calls is not reported by
either tool. A line the engine records nothing for keeps its PMD finding.

The same exemptions as PMD's rule apply: paging and polling loops (a loop exit whose condition
reads what an I/O call in the loop returned, as in
`do { page = loader.page(n++); } while (page.hasNext())`; a loop that takes the next element of a
collection or iterator each round is never a paging loop, so
`for (Long id : ids) { if (repo.findById(id).isEmpty()) break; }` is reported), retry attempts (a
`try` in the loop that leaves it on success while its `catch` stays in the loop), batch methods
(`saveAll`, `findAllById`, `deleteAllById`, `batchUpdate`, `multiGet`, `executePipelined` and
similar), chunk calls (the argument is the loop element and itself a collection, or a `subList`,
`partition`, `chunked` or `windowed` slice of it, or a copy of one, as in
`for (List<Long> chunk : chunks) loader.forget(chunk)`), batches accumulated and flushed in steps
(a call whose collection argument is a list or array declared before the loop and filled with
`add`/`addAll`/`put` in it, as in
`batch.add(id); if (batch.size() == 100) { repo.findByIdIn(batch); batch = new ArrayList<>(); }`; a
list created inside each iteration does not count), writes flushed in steps (`persist`, `merge`,
`save`, `remove`, `flush` and `clear` in a loop that calls `flush()` or `clear()` on the
`EntityManager`, a Hibernate session or a repository under a modulo test such as
`if (++count % 50 == 0)`), `Optional` callbacks and file calls. A loop the rule misjudges (a
count-then-page loop, a cursor held in an object or an array) is not understood: put it in
`exceptions` for `effects/IoCallInLoop` with the reason.
Spring Data getters are not reads, but derived queries are (`getFirstByStatus`,
`getOrderByStatus`, `getAllBy...`). A Redis read or write per item (`opsForValue().get(key)`,
Jedis and Lettuce commands) is reported with `MGET` or a pipeline as the allowed form. `message`
calls are never reported: one publish per item is the protocol, and the client batches. A remote
call inside a concurrent per-item form is left to the fan-out rules. A callback that runs later is
not part of the loop or of the caller's scope: a `Thread` (`new Thread(...)`,
`Thread.startVirtualThread`, `Thread.ofVirtual().start`), a `Timer` or scheduler task, a listener
or callback registration, an `@Async` method, and `CompletableFuture.supplyAsync`/`runAsync` or an
executor `submit` whose future the method never joins and never lets escape. A future that
escapes (returned, stored in a field, put in a collection) is concurrent per-item work, so
`ids.stream().map(id -> supplyAsync(() -> repo.findById(id)))` and
`futures.add(executor.submit(() -> repo.findById(id)))` per item are reported for `database` calls.

`LazyRelationInLoop` reports only what it can prove, and only per element: reading the first
element's relationship (`findAll().get(0).getCustomer()`) is one load. A list whose origin it cannot
see (a parameter, a field, a list built in the method) is not reported, nor is a relationship whose
identifier getter (`getCustomer().getId()`) is the only use: Hibernate answers that from the proxy.
A relationship read in a project helper that takes the element (`nameOf(invoice)`, also as a
method reference `invoices.stream().map(this::nameOf)`) counts as read in the loop. A query with `setHint(...)` or a criteria query counts as unknown. When
`hibernate.default_batch_fetch_size` or `spring.jpa.properties.hibernate.default_batch_fetch_size`
is above one in an `application*.properties` or `application*.yml` under any `src/main/resources`
of the project, every lazy load is batched and the rule reports nothing: nitpicker reads the
setting with the Spring configuration parser and hands it to the engine on Gradle and Maven alike.

`RemoteCallInTransaction` and `RemoteCallUnderLock` look at the calls in the scope and in the
lambdas and anonymous classes it creates, unless those run elsewhere (`CompletableFuture.runAsync`,
an executor `submit` that is not joined, a `TransactionSynchronization` (`afterCommit`, `afterCompletion`; an anonymous class or Kotlin `object :`
passed to `registerSynchronization`), a coroutine `launch`, a `Thread`, a stored lambda that the
scope never calls, a scheduled task or a listener). A call to an `@Async` method, or to a
`@Transactional(propagation = NOT_SUPPORTED)` or `NEVER` method, leaves the transaction too. A
`@Transactional` private method opens no transaction (Spring's proxy cannot see it). A remote
helper called from a transaction scope that never touches the database is not reported: without a
query the transaction may never take a connection. The `Connection.setAutoCommit(false)` scope
runs to the last `commit()` or `rollback()` on the same connection, so an early `rollback()` branch
does not end it.

`RetryWithoutIdempotency` reports only the write contracts above; an HTTP `POST` alone, a
repository `save` and other unknown contracts are not reported. A key counts when the
`RequestOptions` (or SQS/SNS request) comes from a parameter, a field, or a project helper that
builds it with the key.
