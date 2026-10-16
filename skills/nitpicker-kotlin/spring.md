# Spring in Kotlin

For a Kotlin project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `spring/Spring...` and `spring/Jpa...` for Kotlin
files (the Java files of a mixed module get `pmd/Spring...` as in the Java skill), plus the
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
  exceptions; let them propagate.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Data classes in and out, `@Valid` on every `@RequestBody`.
- No `@CrossOrigin`; CORS is configured once. Passwords through
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`.

JPA and Spring Data:

- Entities are open classes (the `kotlin-jpa` and `kotlin-spring` plugins; not data classes, enums
  or objects), with a `@Version` property next to the `@Id` (or inherited from a
  `@MappedSuperclass`) and `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and `@OneToOne` says
  `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and never cascades `ALL`
  or `REMOVE`.
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
  `map`, `onEach`): call `saveAll` once (per chunk for large inputs). The one loop allowed is the
  JPA batch loop that calls `persist`, then `flush` and `clear` on the `EntityManager`. No other
  `flush` or `saveAndFlush`.
- Native SQL only when JPQL can't express it, marked on that one function with
  `@Suppress("PMD.SpringDataNativeQuery")`.

A Spring rule that flags legitimate code takes an `exceptions` entry named as printed, for example
`spring/SpringDataNoSaveInLoop`; ask the maintainer, never suppress. The configuration checks
(`spring/open-in-view`, `spring/ddl-auto`, `spring/risky-startup-flags`, ...) and the ArchUnit rules
are the same as in the Java skill (its spring.md).
