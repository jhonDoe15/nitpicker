# Spring in Kotlin

For a Kotlin project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `pmd/Spring...` and `pmd/Jpa...` for Kotlin files
and Java files alike (the same 55 rules as in the Java skill), plus the
`application*.properties` and `application*.yml` checks. Write it this way. The rules read syntax,
not types: a repository or `EntityManager` must be a declared type (a parameter, property or typed
local) for the save and flush rules to see it.

Beans and configuration:

- One constructor, `private val` constructor properties, no `@Autowired`. No `@Inject`, `@Resource`
  or `@Value` on properties or setters. Bean properties are all `val`; keep per-call state in locals.
- No `ApplicationContext`/`BeanFactory` lookups and no `@Lazy` on injection points. Break a cycle
  with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`; `@Bean` functions take their dependencies as
  parameters. No `@ComponentScan` or `scanBasePackages`.
- Configuration comes in through a `@ConfigurationProperties` data class. No `@Value` outside
  configuration classes, no `System.getenv`, `System.getProperty` or `Environment.getProperty` in
  beans. `@Profile` only on `@Configuration` classes and `@Bean` functions.
- Secrets have no default: `${jwt.secret}`, with no fallback in `@Value`, `@DefaultValue` or
  `getProperty`.
- Build HTTP clients once, from the injected `RestClient.Builder` or `RestTemplateBuilder`, with
  connect and read timeouts; never `RestTemplate()`, `RestClient.create()` or `WebClient.create()`
  inside a function that runs per call.
- No repository, `EntityManager` or remote call in `@PostConstruct`; use an `ApplicationRunner`.
  A singleton bean fills a plain `mutableMapOf` or `HashMap` only at startup; later changes need a
  `ConcurrentHashMap` or a cache.

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`):

- Only on public, open functions of open classes. Use the `kotlin-spring` compiler plugin (the
  Spring Initializr adds it), so annotated classes are open; write no `final`, `private`,
  `protected` or `internal` on a proxied function. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a function from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean.
- `@Transactional` goes on services, not controllers. Avoid `Propagation.REQUIRES_NEW`. Inside a
  transactional function, don't catch and swallow `Exception`, `RuntimeException` or persistence
  exceptions; let them propagate. A `@Throws` of a checked exception needs
  `rollbackFor = [Exception::class]`; a write under `readOnly = true` needs a `@Transactional`
  of its own without it.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Data classes in and out, `@Valid` on every `@RequestBody`.
- No `@CrossOrigin`; CORS is configured once, with listed origins (no `"*"` next to credentials).
  Passwords through `PasswordEncoderFactories.createDelegatingPasswordEncoder()`, and no user with
  a literal password in code.
- Security: end with `anyRequest().authenticated()` (`anyExchange()` on WebFlux) and name public
  paths in `requestMatchers(...).permitAll()`, never `/**`. CSRF stays on for session-based chains;
  switch it off only in a stateless chain (`SessionCreationPolicy.STATELESS`, or a resource server
  with `jwt` or `opaqueToken`).
- Handlers return a data class or a specific type, never `Any`, `Map<String, Any>`, `JsonNode`,
  `ResponseEntity<*>` or `null`; `@RequestBody` binds a validated data class. An
  `@ExceptionHandler` logs the exception and returns a `ProblemDetail` with a fixed detail, not the
  message or stack trace of a generic exception.

JPA and Spring Data:

- Entities are open classes (the `kotlin-jpa` and `kotlin-spring` plugins; not data classes, enums
  or objects), with a `@Version` property next to the `@Id` (or inherited from a
  `@MappedSuperclass`) and `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and `@OneToOne` says
  `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and never cascades `ALL`
  or `REMOVE`. Enum properties say `@Enumerated(EnumType.STRING)`. `hashCode` never uses the
  generated id (nor a data class entity): return `javaClass.hashCode()` or hash an immutable
  business key.
- Every repository function you declare has `@Query` (JPQL in a raw string) with named parameters
  (`:email`); inherited functions such as `findById` and `save` need nothing. No derived names like
  `findByEmailAndStatus`.

  ```kotlin
  @Query(
      """
      select o from Order o
      join fetch o.customer
      where o.status = :status
      """,
  )
  fun withCustomerByStatus(status: OrderStatus): List<Order>
  ```

- `@Modifying(clearAutomatically = true, flushAutomatically = true)`.
- Never `save`, `delete` or `persist` one entity per loop iteration (`for`, `while`, `forEach`,
  `map`, `onEach`), also through a helper function or `saveAll(listOf(x))`, and no update or delete
  per row: call `saveAll` once (per chunk for large inputs) or write one set-based `@Query`. Filter
  and count in the query, not on `findAll()`. Queries are constant raw strings with bind parameters,
  never built with `+`, a string template or `String.format`. The one loop allowed is the
  JPA batch loop that calls `persist`, then `flush` and `clear` on the `EntityManager`. No other
  `flush` or `saveAndFlush`.
- Native SQL only when JPQL can't express it, marked on that one function with
  `@Suppress("PMD.SpringDataNativeQuery")`.

A Spring rule that flags legitimate code takes an `exceptions` entry named as printed, for example
`pmd/SpringDataNoSaveInLoop`; ask the maintainer, never suppress. The configuration checks
(`spring/open-in-view`, `spring/ddl-auto`, `spring/risky-startup-flags`, ...) and the ArchUnit rules
are the same as in the Java skill (its spring.md).
