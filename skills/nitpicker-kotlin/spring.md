# Spring

For a Kotlin project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker adds its Spring rules, reported as `pmd/Spring...`, `pmd/Jpa...`, `pmd/SpringData...`,
`archunit/spring-...` and `spring/<rule>`; each message names the Kotlin form and what to change.

Layout (`archunit/spring-...` read the compiled classes):

- Package by feature under the `@SpringBootApplication` package: `<root>.<feature>` holds its
  controller, service, repository and entity; other features use only the classes directly in it;
  pure utilities go to `<root>.shared`. Controllers call services and exchange data classes, never
  entities; a controller never holds another controller, a repository never calls a service, and
  services know nothing of the web layer.
- A test that starts a Spring context is named `*IT` or lives in an integration test source set. No
  `@DirtiesContext`. A `@SpringBootTest` injects a bean, `MockMvc`, `WebTestClient` or
  `TestRestTemplate`, or starts a web server port; otherwise call the constructor,
  `OrderService(orders, clock)`, or use a slice (`@WebMvcTest(OrderController::class)`,
  `@DataJpaTest`).

Beans and configuration:

- Constructor injection with `private val`s. No `@Autowired` on the one constructor, and no
  `@Autowired`, `@Inject`, `@Resource` or `@Value` on a property, `lateinit var` or setter. A bean
  has no `var`, also in its `companion object`; keep per-call state in locals.
- A `mutableMapOf()` or `HashMap` of a singleton is filled at startup and then only read; to change
  it later use `ConcurrentHashMap`, `@Cacheable` or a lock around every write (`synchronized`,
  `withLock`, `@Synchronized`).
- A request- or session-scoped bean reaches a singleton only as `ObjectProvider<T>` or through a
  scoped proxy, `@RequestScope`. Request data never lands in a singleton's property or its
  `companion object`: pass it through parameters and return values. No `ApplicationContext` or
  `BeanFactory` lookups, no `@Lazy` on injection points: break a cycle with a new component or an
  event.
- `@Configuration(proxyBeanMethods = false)`, `@Bean` functions take dependencies as parameters. No
  `@ComponentScan` or `scanBasePackages`.
- A `@Bean` function that returns a `BeanPostProcessor` or `BeanFactoryPostProcessor`, or carries
  `@ConfigurationPropertiesBinding`, sits in a `companion object` with `@JvmStatic` and takes only
  `Environment` or `ObjectProvider<T>`.
- Beans taken from an `ObjectProvider` go through `orderedStream()`, never a `for` loop, `forEach`,
  `map`, `toList`, `stream()` or `iterator()` on the provider, which ignore `@Order`.
- Configuration comes in through a `@ConfigurationProperties` data class: `data class
RemoteProperties(val url: String, val timeout: Duration)`. `@Value` only in a `@Configuration`
  class (`"\${shop.token}"`); no `System.getProperty`, `Environment.getProperty` or `env["key"]` in
  beans; `System.getenv` stays in `fun main` or the application class. A secret has no default: not
  in `@Value`, not `getProperty(key) ?: "x"`, not `val secret: String = "dev"`. `@Profile` only on
  `@Configuration` and `@Bean`.
- HTTP clients are built once, from the injected `RestClient.Builder` or `RestTemplateBuilder`
  (`private val`, `init` or `@Bean`), with timeouts. No database or HTTP calls in `@PostConstruct`,
  `afterPropertiesSet` or a `@Bean(initMethod = ...)` function; use an `ApplicationRunner`.
- Executors, schedulers, Netty event loops, clients and coroutine scopes are their own `@Bean` (a
  `ThreadPoolTaskExecutor` with a queue capacity) so Spring closes them. A bean that builds one in a
  property releases it in `@PreDestroy`: `shutdown()`, then `shutdownNow()` when `awaitTermination`
  times out, or `scope.cancel()`. A startup function that binds a port or starts a server after
  starting threads shuts them down in a `catch` and rethrows. Never `Executors.newCachedThreadPool()`.
- `@Scheduled`, `@Async`, cache annotations, `@PreAuthorize` and `@Retryable` need their
  `@Enable...` on a `@Configuration` class.

Proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`, `@PreAuthorize`, `@RolesAllowed`,
Resilience4j, Micrometer `@Timed`, constraints in a `@Validated` class, and annotations of your own
that carry one of these or that an `@Aspect` matches):

- Spring subclasses the bean and Kotlin is final by default: apply `kotlin("plugin.spring")` or
  write `open class` and `open fun`. A proxied function is public and never in an `object` or
  `companion object`.
- Never call such a function from its own class, also as `this::name` or leaving out default
  arguments: the proxy is skipped. Put it in another bean.
- Spring's `Transactional`, on services, never on a controller, no `Propagation.REQUIRES_NEW`.
  Rethrow what you catch inside it: no swallowed `Exception`, `RuntimeException`, `Throwable` or
  persistence exception, no `runCatching` without `getOrThrow()` or a throwing `getOrElse`,
  `onFailure` or `fold`.
- `@Throws(IOException::class)` or a checked `throw` needs `rollbackFor = [Exception::class]`. A
  write under `readOnly = true` needs its own plain `@Transactional`.
- A public service function that writes more than once (`save`, `delete`, a `@Modifying` query,
  `jdbcTemplate.update`), also through its private helpers, is `@Transactional` or runs the writes in
  `transactionTemplate.execute { }`.
- Write caches after the commit (`TransactionSynchronization.afterCommit`, a
  `@TransactionalEventListener`, or the caller), never inside a writing transaction: no Spring
  `Cache.put`/`evict`, `@CachePut`, Caffeine or Guava `put`/`invalidate`, or a map property filled
  with a just-saved row. A transaction-aware cache manager makes the Spring `Cache` calls fine.
- `@Async("executorName")` returning `CompletableFuture`; `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController` without `@ResponseBody`; `@GetMapping`, `@PostMapping`, ... on functions,
  `@RequestMapping` only on the class. Data classes in and out, `@Valid` on every `@RequestBody`;
  constraints on constructor properties need a use-site target, `@field:NotBlank val item: String`.
- No `Any`, `JsonNode`, `Map<String, Any>`, `ResponseEntity<*>` or `return null` in or out of a
  handler, also inside `List`, `Flow`, `Mono` or `ResponseEntity`; `suspend` handlers are fine. No
  body: `Unit` or `ResponseEntity<Void>`.
- An `@ExceptionHandler` returns a `ProblemDetail` with a fixed detail, never the stack trace or the
  `message` of `Exception`, a JDK or persistence exception.
- Security: end with `authorize(anyRequest, authenticated)`; `csrf { disable() }` only in a
  stateless chain; no `"*"` origin with credentials; no `@CrossOrigin`, configure CORS once;
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`; no user passwords in source.

`application*.properties` and `application*.yml` (`spring/<rule>`; test profiles, including the ones
your tests activate with `@ActiveProfiles`, and local or dev ones where noted, are exempt):

- With JPA, `spring.jpa.open-in-view=false`; `ddl-auto` is `none` or `validate`, `generate-ddl` off.
  No `allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` set to
  true.
- Actuator endpoints by name, never `*`; no `include-stacktrace` of `always` or `on-param`; no
  show-sql, bind logging, H2 console or `always` actuator details. Secrets from the environment,
  `password=${DB_PASSWORD}`, no literal default. Profiles from `SPRING_PROFILES_ACTIVE`, not the
  main file.

JPA and Spring Data (`pmd/Jpa...`, `pmd/SpringData...`; SQL or JPQL built from runtime values is
`kotlin-source/SqlStringBuilding`):

- Entities are plain, non-final classes, never `data class`: `kotlin("plugin.jpa")`, plus
  `kotlin("plugin.allopen")` with `allOpen { annotation("jakarta.persistence.Entity") }`. Put
  `@Version var version: Long? = null` next to the `@Id`, with `@GeneratedValue(strategy =
GenerationType.SEQUENCE)`. `@ManyToOne` and `@OneToOne` say `fetch = FetchType.LAZY`, nothing is
  `EAGER`. `@ManyToMany` is a `Set` and never cascades `ALL` or `REMOVE`. Enums say
  `@Enumerated(EnumType.STRING)`. `hashCode` never reads the generated id: `override fun hashCode()
= javaClass.hashCode()`, or an immutable business key.
- Every repository function you declare has `@Query` with named parameters (`:status`) and constant
  JPQL text, a raw string when it spans lines, never joined with `+`. Inherited `findById` and
  `save` need nothing; no derived names (`findByEmailAndStatus`). `@Modifying(clearAutomatically =
true, flushAutomatically = true)`, with `@Transactional` on the function or the repository interface.
- Never `save` or `delete` one entity per iteration of a loop, `forEach` or `map`: call `saveAll`
  once, per chunk for large inputs. No `flush` or `saveAndFlush` except in the JPA batch loop: a
  `for` or `while` loop that calls `persist`, then `flush` and `clear` on the `EntityManager`.
  Filter, count, sort and total in the query, not on the rows a repository function returned
  (`findAll()`, `findAllById`, a `@Query` function, a page's `content`), a `Flux` or `Flow` one
  included: no `size`, `isEmpty()` or `count()` (a count or exists query), no `filter`, `any` or
  `first { }` on stored properties (a where clause), no `sortedBy`/`sortedWith(compareBy(...))`
  (order by or a `Sort` argument), no `sumOf`, `maxOf` or `groupingBy { }.eachCount()` (an
  aggregate `@Query`). Mapping rows to DTOs is fine. A local holding the rows is not followed, but
  write the same in the query there too. Native SQL only when JPQL can't express it,
  marked on that one function with `@Suppress("PMD.SpringDataNativeQuery")`,
  `EntityManager.createNativeQuery` too.
