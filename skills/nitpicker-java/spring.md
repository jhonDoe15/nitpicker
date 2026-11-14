# Spring

For a Java project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `pmd/Spring...`, `pmd/Jpa...` and, for the
architecture rules below, `archunit/spring-...`. Write it this way.

Layout (enforced by `archunit/spring-...`; each message says what to change):

- Package by feature under the `@SpringBootApplication` package: `<root>.<feature>` holds its
  controller, service, repository and entity; other features use only the services and records
  directly in it, never its repositories or entities (`foreign-feature-persistence`); pure
  utilities go to `<root>.shared`. Controllers call services and exchange records, never
  entities; a controller never holds another controller, and a repository never calls a service;
  services know nothing of the web layer.
- A test that starts a Spring context is an integration test: name it `*IT` in its own package
  (package-private classes stay visible) or put it in an integration test source set; a unit test
  of a service is `new OrderService(mock(...))`.

Beans and configuration:

- One constructor, `private final` fields, no `@Autowired`. No `@Inject`, `@Resource` or `@Value`
  on fields or setters. Bean fields are all `final`; keep per-call state in locals.
- A request- or session-scoped bean reaches a singleton only as `ObjectProvider<T>` (call
  `getObject()` per use) or through a scoped proxy (`@RequestScope`, `@SessionScope`).
- No `ApplicationContext`/`BeanFactory` lookups and no `@Lazy` on injection points. Break a cycle
  with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`; `@Bean` methods take their dependencies as
  parameters. No `@ComponentScan` or `scanBasePackages`.
- A `@Bean` method that returns a `BeanPostProcessor` or `BeanFactoryPostProcessor`, or carries
  `@ConfigurationPropertiesBinding`, is `static` and takes only `Environment` or `ObjectProvider<T>`.
- Customizers and other beans taken from an `ObjectProvider` go through `orderedStream()`, never
  `stream()`, `forEach`, `iterator()` or a for-each loop, which ignore `@Order`.
- Configuration comes in through a `@ConfigurationProperties` record. No `@Value` outside
  configuration classes, no `System.getenv`, `System.getProperty` or `Environment.getProperty` in
  beans or helper classes (JVM properties such as `java.*` are fine). `@Profile` only on
  `@Configuration` classes and `@Bean` methods.
- No mutable state in singleton beans: no `static` non-final fields, no plain collection written
  after startup (build lookup tables once with `Map.copyOf`). Request data (handler parameters,
  `RequestContextHolder`, `SecurityContextHolder`) never lands in a singleton or static field, not
  even a `ConcurrentHashMap` (`archunit/spring-request-state`): pass it through parameters and
  return values, keep per-request data in a `@RequestScope` bean, and cache with `@Cacheable` or a
  Caffeine cache that has a size and an expiry.
- HTTP clients are built once, from the injected builders, with timeouts. No database or HTTP calls
  in `@PostConstruct`; use an `ApplicationRunner`.
- Executors, schedulers, Netty event loops and clients are their own `@Bean` (a
  `ThreadPoolTaskExecutor` with a queue capacity) so Spring closes them. A bean that builds one in a
  field releases it in `@PreDestroy`: `shutdown()`, then `shutdownNow()` when `awaitTermination`
  times out. A startup method that binds a port or starts a server after starting threads shuts
  them down in a `catch` and rethrows. Never `Executors.newCachedThreadPool()`.
- `@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and `@Retryable` need their
  `@Enable...` on a `@Configuration` class. Secrets have no default (`${jwt.secret}`).

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`, `@RolesAllowed`, Resilience4j, Micrometer `@Timed`, constraints in a `@Validated`
class, and annotations of your own that carry one of these or that an `@Aspect` matches):

- Only on public, non-final, non-static methods of non-final classes. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a method from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean.
- `@Transactional` goes on services, not controllers. Avoid `Propagation.REQUIRES_NEW`. Inside a
  transactional method, don't catch and swallow `Exception`, `RuntimeException` or persistence
  exceptions; let them propagate.
- A checked `throws` needs `rollbackFor = Exception.class`; a write under `readOnly = true` (a
  repository write or `@Modifying` query, DML through `JdbcTemplate`, `JdbcClient` or jOOQ, or a setter
  on an entity the method loaded) needs its own plain `@Transactional`. To shape a response from an
  entity, map it to a DTO instead of changing it.
- A public service method that writes more than once (`save`, `delete`, a `@Modifying` query,
  `JdbcTemplate.update`), also through its private helpers, is `@Transactional` or runs the writes in
  `TransactionTemplate.execute`.
- Write caches after the commit (`TransactionSynchronization.afterCommit`, a
  `@TransactionalEventListener`, or the caller), never inside a writing transaction: no Spring
  `Cache.put`/`evict`, `@CachePut`, Caffeine or Guava `put`/`invalidate`, or a map field filled with a
  just-saved row. A transaction-aware cache manager makes the Spring `Cache` calls fine.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Records in and out, `@Valid` on every `@RequestBody`.
- No `Object`, `JsonNode`, `Map<String, Object>`, `ResponseEntity<?>` or `null` in or out of a
  handler. An `@ExceptionHandler` never returns a generic exception's message or stack trace.
- Security: end with `anyRequest().authenticated()` (`anyExchange()` on WebFlux), keep CSRF on for session-based chains, no `"*"`
  origin with credentials, no user passwords in source.
- No `@CrossOrigin`; CORS is configured once. Passwords through
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`, never a weak encoder.

JPA and Spring Data:

- Entities are non-final classes (not records), with a `@Version` field next to the `@Id` (or
  inherited from a `@MappedSuperclass`) and `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and
  `@OneToOne` says `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and never
  cascades `ALL` or `REMOVE`. Enum fields and enum element collections say `@Enumerated(EnumType.STRING)`. `hashCode` never uses
  the generated id: return `getClass().hashCode()` or hash an immutable business key.
- Every `@ManyToOne` join column leads an index of the entity's `@Table`, for example
  `@Table(indexes = @Index(columnList = "customer_id"))` (`JpaUnindexedForeignKey`); PostgreSQL
  does not index foreign keys itself. With migrations, the index goes in the migration instead
  (`foreign-key-index`).
- Every repository method you declare has `@Query` (JPQL in a text block for JPA) with named parameters
  (`:email`); inherited methods such as `findById` and `save` need nothing. No derived names like
  `findByEmailAndStatus`.

  ```java
  @Query("""
      select o from Order o
      join fetch o.customer
      where o.status = :status
      """)
  List<Order> withCustomerByStatus(OrderStatus status);
  ```

- `@Modifying(clearAutomatically = true, flushAutomatically = true)`, with `@Transactional` on the method
  or the repository interface; so does a derived `deleteBy...` that an exception allows.
- Never `save`, `delete` or `persist` one entity per loop iteration: call `saveAll` once (per chunk
  for large inputs), also through a helper, `saveAll(List.of(x))` or a `@Modifying` update per row.
  The one loop allowed is the JPA batch loop that calls `persist`, then `flush` and `clear` on the
  `EntityManager`. No other `flush` or `saveAndFlush`.
- Index every foreign key in the Flyway or Liquibase migration that adds it:
  `CREATE INDEX ON orders (customer_id)`, or an index or primary key that starts with the column.
  PostgreSQL does not create one (`foreign-key-index`).
- Filter and count in the query, not after `findAll()`: not with `stream()`, `size()`, a local
  that holds the list, or a reactive `filter`, `count`, `any`, `hasElements`, `take` or
  `collectList()`. Query text is constant (a text block) and
  values are bind parameters, in JPQL and JDBC alike.
- Fetch at most one collection per query (`join fetch`, Criteria `fetch` or an entity graph); load
  the others in their own query or with `@BatchSize` or `@Fetch(FetchMode.SUBSELECT)`
  (`JpaMultipleCollectionFetch`). Two fetched collections return a row for every pair.
- Native SQL only when JPQL can't express it, marked on that one method with
  `@SuppressWarnings("PMD.SpringDataNativeQuery")`, `EntityManager.createNativeQuery` too.

Tests:

- `@SpringBootTest` is for integration and component tests that use the context (an injected bean,
  `MockMvc`, `WebTestClient`, `TestRestTemplate`). Unit-test a class by creating it with `new`, and
  test one layer with a slice such as `@WebMvcTest` or `@DataJpaTest` (`SpringUnusedContext`).

`application*.properties` and `application*.yml` (findings `spring/<rule>`; test profiles, including
the ones your tests activate with `@ActiveProfiles` or have a file for under `src/test/resources`,
and local or dev ones where noted, are exempt):

- With JPA, set `spring.jpa.open-in-view=false`.
- `spring.jpa.hibernate.ddl-auto` is `none` or `validate` (schema changes go in migrations), and
  `spring.jpa.generate-ddl` stays off; local and dev profiles may differ.
- No `spring.main.allow-circular-references`, `allow-bean-definition-overriding` or
  `lazy-initialization` set to true.
- List actuator endpoints by name, never `management.endpoints.web.exposure.include=*` (local and
  dev may).
- No `server.error.include-stacktrace=always` or `on-param` (local and dev may).
- Secrets come from the environment: `password=${DB_PASSWORD}`, with no literal default, also for
  key names and credentials in URLs.
- Profiles come from `SPRING_PROFILES_ACTIVE`, not the main file. No show-sql, bind logging, H2
  console or `always` actuator details (local and dev may).
- Every key binds to a property, also in test resources and test overrides (`@SpringBootTest`
  `properties`, `@TestPropertySource`, `withPropertyValues`, `DynamicPropertyRegistry.add`): use the
  name the Spring Boot metadata or your `@ConfigurationProperties` class defines
  (`spring.datasource.username`, not `user`); declare a key only code reads by name in
  `META-INF/additional-spring-configuration-metadata.json`.
