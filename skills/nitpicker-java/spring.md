# Spring

For a Java project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `pmd/Spring...`, `pmd/Jpa...` and, for the
architecture rules below, `archunit/spring-...`. Write it this way.

Layout (enforced by `archunit/spring-...`; each message says what to change):

- Package by feature under the `@SpringBootApplication` package: `<root>.<feature>` holds its
  controller, service, repository and entity; other features use only the classes directly in it;
  pure utilities go to `<root>.shared`. Controllers call services and exchange records, never
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
- `@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and `@Retryable` need their
  `@Enable...` on a `@Configuration` class. Secrets have no default (`${jwt.secret}`).

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`):

- Only on public, non-final, non-static methods of non-final classes. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a method from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean.
- `@Transactional` goes on services, not controllers. Avoid `Propagation.REQUIRES_NEW`. Inside a
  transactional method, don't catch and swallow `Exception`, `RuntimeException` or persistence
  exceptions; let them propagate.
- A checked `throws` needs `rollbackFor = Exception.class`; a write under `readOnly = true` needs its
  own plain `@Transactional`.
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

- `@Modifying(clearAutomatically = true, flushAutomatically = true)`.
- Never `save`, `delete` or `persist` one entity per loop iteration: call `saveAll` once (per chunk
  for large inputs), also through a helper, `saveAll(List.of(x))` or a `@Modifying` update per row.
  The one loop allowed is the JPA batch loop that calls `persist`, then `flush` and `clear` on the
  `EntityManager`. No other `flush` or `saveAndFlush`.
- Filter in the query, not with `findAll().stream()`. Query text is constant (a text block) and
  values are bind parameters, in JPQL and JDBC alike.
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
