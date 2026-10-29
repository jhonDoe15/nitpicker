# Spring

For a Kotlin project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker adds its Spring rules, reported as `pmd/Spring...`, `pmd/Jpa...`, `pmd/SpringData...` (ids
below), `archunit/spring-...` and `spring/<rule>`. Each finding names the Kotlin form.

Layout (`archunit/spring-...` read the compiled classes; each message says what to change):

- Package by feature under the `@SpringBootApplication` package: `<root>.<feature>` holds its
  controller, service, repository and entity; other features use only the classes directly in it;
  pure utilities go to `<root>.shared`. Controllers call services and exchange data classes, never
  entities; a controller never holds another controller, a repository never calls a service, and
  services know nothing of the web layer (`spring-layout`, `-feature-boundary`, `-shared-pure`,
  `-controller-repository`, `-controller-entity`, `-controller-controller`, `-service-web`,
  `-repository-service`).
- A test that starts a Spring context is named `*IT` or lives in an integration test source set
  (`spring-test-placement`). No `@DirtiesContext` (`spring-no-dirties-context`). A `@SpringBootTest`
  injects a bean, `MockMvc`, `WebTestClient` or `TestRestTemplate`, or starts a web server port
  (`SpringUnusedContext`); otherwise call the constructor, `OrderService(orders, clock)`, or use a
  slice (`@WebMvcTest(OrderController::class)`, `@DataJpaTest`).

Beans and configuration:

- Constructor injection with `private val`s. No `@Autowired` on the one constructor, and no
  `@Autowired`, `@Inject`, `@Resource` or `@Value` on a property, `lateinit var` or setter
  (`SpringConstructorInjection`). A bean has no `var`, also in its `companion object`
  (`SpringImmutableBeans`, `kotlin-source/MutableModuleState`); keep per-call state in locals.
- A `mutableMapOf()` or `HashMap` of a singleton is filled at startup and then only read; to change
  it later use `ConcurrentHashMap`, `@Cacheable` or a lock around every write (`synchronized`,
  `withLock`, `@Synchronized`) (`SpringBeanCollectionState`).
- A request- or session-scoped bean reaches a singleton only as `ObjectProvider<T>` or through a
  scoped proxy, `@RequestScope` (`spring-scope-capture`). No `ApplicationContext` or `BeanFactory`
  lookups (`SpringNoServiceLocator`), no `@Lazy` on injection points (`SpringNoLazyInjection`):
  break a cycle with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`, `@Bean` functions take dependencies as parameters
  (`SpringLiteConfiguration`). No `@ComponentScan` or `scanBasePackages` (`SpringNoComponentScan`).
- Configuration comes in through a `@ConfigurationProperties` data class:
  `data class RemoteProperties(val url: String, val timeout: Duration)`. `@Value` only in a
  `@Configuration` class (`"\${shop.token}"`); no `System.getProperty`, `Environment.getProperty`
  or `env["key"]` in beans (`SpringTypedConfiguration`); `System.getenv` stays in `fun main` or the
  application class (`style.ForbiddenMethodCall`). A secret has no default: not in `@Value`, not
  `getProperty(key) ?: "x"`, not `val secret: String = "dev"` (`SpringValueSecretDefault`).
  `@Profile` only on `@Configuration` and `@Bean` (`SpringProfileOnConfiguration`).
- HTTP clients are built once, from the injected `RestClient.Builder` or `RestTemplateBuilder`
  (`private val`, `init` or `@Bean`), with timeouts (`SpringHttpClientPerCall`,
  `SpringHttpClientTimeouts`). No database or HTTP calls in `@PostConstruct`, `afterPropertiesSet`
  or a `@Bean(initMethod = ...)` function; use an `ApplicationRunner` (`SpringNoPostConstructIo`).
- `@Scheduled`, `@Async`, cache annotations, `@PreAuthorize` and `@Retryable` need their
  `@Enable...` on a `@Configuration` class (`spring/missing-enable`).

Proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`, `@PreAuthorize`):

- Spring subclasses the bean and Kotlin is final by default: apply `kotlin("plugin.spring")` or
  write `open class` and `open fun`. A proxied function is public and never in an `object` or
  `companion object` (`SpringProxyMethodVisibility`).
- Never call such a function from its own class, also as `this::name` or leaving out default
  arguments: the proxy is skipped. Put it in another bean (`SpringProxySelfCall`).
- Spring's `Transactional`, on services, never on a controller, no `Propagation.REQUIRES_NEW`
  (`SpringTransactionalAnnotation`, `SpringNoTransactionalController`, `SpringNoRequiresNew`).
  Rethrow what you catch inside it: no swallowed `Exception`, `RuntimeException`, `Throwable` or
  persistence exception, no `runCatching` without `getOrThrow()` or a throwing `getOrElse`,
  `onFailure` or `fold` (`SpringNoSwallowedTransactionException`).
- `@Throws(IOException::class)` or a checked `throw` needs `rollbackFor = [Exception::class]`
  (`SpringTransactionalCheckedRollback`). A write under `readOnly = true` needs its own plain
  `@Transactional` (`SpringTransactionalReadOnlyWrite`).
- `@Async("executorName")` returning `CompletableFuture` (`SpringAsyncExecutor`); `@Scheduled` with
  `fixedDelay` or `cron`, not `fixedRate` (`SpringScheduledFixedDelay`).

Web:

- `@RestController` without `@ResponseBody`; `@GetMapping`, `@PostMapping`, ... on functions,
  `@RequestMapping` only on the class (`SpringRestController`, `SpringComposedMapping`). Data
  classes in and out, `@Valid` on every `@RequestBody` (`SpringValidRequestBody`); constraints on
  constructor properties need a use-site target, `@field:NotBlank val item: String` (judgement).
- No `Any`, `JsonNode`, `Map<String, Any>`, `ResponseEntity<*>` or `return null` in or out of a
  handler, also inside `List`, `Flow`, `Mono` or `ResponseEntity`; `suspend` handlers are fine
  (`SpringTypedResponse`, `SpringTypedRequestBody`). No body: `Unit` or `ResponseEntity<Void>`.
- An `@ExceptionHandler` returns a `ProblemDetail` with a fixed detail, never the stack trace or the
  `message` of `Exception`, a JDK or persistence exception (`SpringNoErrorLeak`).
- Security: end with `authorize(anyRequest, authenticated)` (`SpringPermitAllAnyRequest`);
  `csrf { disable() }` only in a stateless chain (`SpringCsrfDisabled`); no `"*"` origin with
  credentials (`SpringCorsWildcard`); no `@CrossOrigin`, configure CORS once
  (`SpringNoCrossOrigin`); `PasswordEncoderFactories.createDelegatingPasswordEncoder()`
  (`SpringPasswordEncoder`); no user passwords in source (`SpringHardcodedUser`).

`application*.properties` and `application*.yml` (`spring/<rule>`; test profiles, including the ones
your tests activate with `@ActiveProfiles`, and local or dev ones where noted, are exempt):

- With JPA, `spring.jpa.open-in-view=false` (`open-in-view`); `ddl-auto` is `none` or `validate`,
  `generate-ddl` off (`ddl-auto`). No `allow-circular-references`,
  `allow-bean-definition-overriding` or `lazy-initialization` set to true (`risky-startup-flags`).
- Actuator endpoints by name, never `*` (`actuator-exposure`); no `include-stacktrace` of `always`
  or `on-param` (`error-details`); no show-sql, bind logging, H2 console or `always` actuator
  details (`unsafe-diagnostics`). Secrets from the environment, `password=${DB_PASSWORD}`, no
  literal default (`literal-secret`). Profiles from `SPRING_PROFILES_ACTIVE`, not the main file
  (`active-profile`).

JPA and Spring Data (`pmd/Jpa...`, `pmd/SpringData...`; SQL or JPQL built from runtime values is
`kotlin-source/SqlStringBuilding`):

- Entities are plain, non-final classes, never `data class`: `kotlin("plugin.jpa")` and
  `allOpen { annotation("jakarta.persistence.Entity") }`. Put `@Version var version: Long? = null`
  next to the `@Id`, with `@GeneratedValue(strategy = GenerationType.SEQUENCE)`. `@ManyToOne` and
  `@OneToOne` say `fetch = FetchType.LAZY`, nothing is `EAGER`. `@ManyToMany` is a `Set` and never
  cascades `ALL` or `REMOVE`. Enums say `@Enumerated(EnumType.STRING)`. `hashCode` never reads the
  generated id: `override fun hashCode() = javaClass.hashCode()`, or an immutable business key.
- Every repository function you declare has `@Query` with named parameters (`:status`) and a
  raw-string JPQL without `trimIndent()` (annotation values are constants). Inherited `findById` and
  `save` need nothing; no derived names (`findByEmailAndStatus`).
  `@Modifying(clearAutomatically = true, flushAutomatically = true)`.
- Never `save` or `delete` one entity per iteration of a loop, `forEach` or `map`: call `saveAll`
  once, per chunk for large inputs. No `flush` or `saveAndFlush` except in a batch loop that calls
  `persist`, `flush` and `clear` on the `EntityManager`. Filter in the query, not
  `findAll().filter { ... }`. Native SQL only when JPQL can't express it, marked on that one
  function with `@Suppress("PMD.SpringDataNativeQuery")`, `EntityManager.createNativeQuery` too.
