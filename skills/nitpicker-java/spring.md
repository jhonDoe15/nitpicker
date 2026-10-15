# Spring

For a Java project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `pmd/Spring...` and `pmd/Jpa...`. Write it this
way.

Beans and configuration:

- One constructor, `private final` fields, no `@Autowired`. No `@Inject`, `@Resource` or `@Value`
  on fields or setters. Bean fields are all `final`; keep per-call state in locals.
- No `ApplicationContext`/`BeanFactory` lookups and no `@Lazy` on injection points. Break a cycle
  with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`; `@Bean` methods take their dependencies as
  parameters. No `@ComponentScan` or `scanBasePackages`.
- Configuration comes in through a `@ConfigurationProperties` record. No `@Value` outside
  configuration classes, no `System.getenv`, `System.getProperty` or `Environment.getProperty` in
  beans; the same for `System.getenv` in any helper class: read the value once through
  `@ConfigurationProperties` and pass it in. JVM properties (`java.*`, `user.*`, `javax.*`, `jdk.*`,
  `http.*`) are fine. `@Profile` only on `@Configuration`
  classes and `@Bean` methods.
- No mutable state in singleton beans: no `static` non-final fields, and no `HashMap`/`ArrayList`/`HashSet`
  field written to after startup. Fill it in the constructor or `@PostConstruct` and keep it as
  `Map.copyOf`/`List.copyOf`, or use a `ConcurrentHashMap`, `@Cacheable`, or the database.
- Build an HTTP client once (injected `RestClient.Builder` or `RestTemplateBuilder`, kept in a
  final field or a `@Bean`), with connect and read timeouts. No `new RestTemplate()` without a
  timeout-configured request factory, `RestClient.create()`, `WebClient.create()`,
  `HttpClient.newHttpClient()`, or `RestClient.builder()` / `WebClient.builder()` /
  `HttpClient.newBuilder()` without `requestFactory`, `clientConnector` or `connectTimeout`, and none
  built inside a method (a `static` factory method is fine). No database or HTTP calls in
  `@PostConstruct` (no transaction, proxies not ready): use an `ApplicationRunner` or
  `@EventListener(ApplicationReadyEvent.class)`.
- `@Scheduled`, `@Async`, `@Cacheable` (and the other cache annotations), `@PreAuthorize` and
  `@Retryable` do nothing until one `@Configuration` class has the matching `@EnableScheduling`,
  `@EnableAsync`, `@EnableCaching`, `@EnableMethodSecurity` or `@EnableRetry`.
- A secret has no default: `@Value("${jwt.secret}")`, not `${jwt.secret:changeit}`; no
  `@DefaultValue` on a secret component and no `getProperty("app.secret", "changeme")`.

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`):

- Only on public, non-final, non-static methods of non-final classes. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a method from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean; `forEach(this::method)` is the same self-call.
- `@Transactional` goes on services, not controllers. Avoid `Propagation.REQUIRES_NEW`. Inside a
  transactional method (or a private helper of a transactional class), don't catch and swallow
  `Exception`, `RuntimeException` or persistence exceptions; let them propagate.
- A `@Transactional` method that declares a checked exception needs `rollbackFor = Exception.class`
  (a checked exception commits otherwise). In a `@Transactional(readOnly = true)` class, a method
  that writes (also `forEach(repo::save)` or a `@Modifying` repository method) carries its own
  plain `@Transactional`.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Records in and out, `@Valid` on every `@RequestBody`.
- A handler returns a record, a list of records, `void` or `ResponseEntity<Record>` / `<Void>`:
  never `Object`, `JsonNode`, `Map<String, Object>`, `ResponseEntity<?>`, a list or `Optional` of
  those, or `null`. A `@RequestBody` is a record (a `Map<String, String>` or a form's
  `MultiValueMap` is fine), never an `Object`, `JsonNode` or `Map<String, Object>`. Errors are
  exceptions that a `@RestControllerAdvice` maps to a `ProblemDetail` with a fixed detail; an
  `@ExceptionHandler` for `Exception`, `RuntimeException`, `IllegalArgumentException`,
  `IOException` or a persistence exception never puts its message or stack trace in the response
  (log it); messages of your own exception types are fine.
- Security: no `anyRequest().permitAll()` (name the public paths, end with
  `anyRequest().authenticated()`; a chain scoped by `securityMatcher(...)` may permit all, and so
  may `requestMatchers(HttpMethod.OPTIONS, "/**")`); no `web.ignoring().requestMatchers("/**")`;
  `csrf` is disabled only in a stateless chain (`SessionCreationPolicy.STATELESS` on the same `http`)
  or a JWT resource-server chain without form, basic or remember-me login; no `"*"` origin together
  with credentials; no user password in source (`User.withUsername(..).password("literal")`,
  `inMemoryAuthentication()`).
- No `@CrossOrigin`; CORS is configured once. Passwords through
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`, never `NoOp`, `MessageDigest`,
  `Md4`, `LdapSha`, `StandardPasswordEncoder` or `User.withDefaultPasswordEncoder()`.

JPA and Spring Data:

- Entities are non-final classes (not records), with a `@Version` field next to the `@Id` and
  `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and `@OneToOne` says
  `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and never cascades `ALL`
  or `REMOVE`. Every enum field says `@Enumerated(EnumType.STRING)` (or has a converter). `hashCode`
  returns `getClass().hashCode()` (never the generated id, and no `@Data` on an entity); with Lombok,
  `@EqualsAndHashCode(onlyExplicitlyIncluded = true)` with `@EqualsAndHashCode.Include` on an
  immutable business key.
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
  for large inputs). That includes `saveAll(List.of(x))` in a loop, a helper such as `store(x)` or
  `forEach(this::store)` that saves one entity, and a `@Modifying` update called per row (write one
  `where id in :ids` query, or pass each chunk of ids to it). A per-row `try`/`catch` import still
  writes per row: `saveAll` per batch with error handling per batch. Reads (`find...`, `count...`)
  in a loop are not judged here. The one loop allowed is the JPA batch loop that calls `persist`,
  then `flush` and `clear` on the `EntityManager`. No other `flush` or `saveAndFlush`.
- Filter in the query: no `findAll().stream().filter(...)`, `findAll().size()`; write an `@Query`
  with `where`, a count or an exists query.
- Query text is a constant (a text block) and values are bind parameters, in `@Query`,
  `EntityManager.createQuery`, `JdbcTemplate`, `NamedParameterJdbcTemplate` and `JdbcClient` alike:
  never `+`, `String.format`, `formatted`, `String.join`, `MessageFormat` or a `StringBuilder`
  with variable parts. For a list use `NamedParameterJdbcTemplate` or `JdbcClient` with
  `in (:ids)`; `String.join(",", Collections.nCopies(n, "?"))` placeholders are accepted.
- Native SQL only when JPQL can't express it, marked on that one method with
  `@SuppressWarnings("PMD.SpringDataNativeQuery")`; `EntityManager.createNativeQuery` needs the
  same marker.

`application*.properties` and `application*.yml` (findings `spring/<rule>`; test profiles, and
local or dev ones where noted, are exempt):

- With JPA, set `spring.jpa.open-in-view=false`.
- `spring.jpa.hibernate.ddl-auto` is `none` or `validate` (schema changes go in migrations), and
  `spring.jpa.generate-ddl` stays off; local and dev profiles may differ.
- No `spring.main.allow-circular-references`, `allow-bean-definition-overriding` or
  `lazy-initialization` set to true.
- List actuator endpoints by name, never `management.endpoints.web.exposure.include=*` (local and
  dev may).
- No `server.error.include-stacktrace=always` or `on-param` (local and dev may).
- Secrets come from the environment: `password=${DB_PASSWORD}`, with no literal default. That holds
  for `signing-key`, `encryption-key`, `jwt-key`, `api.key` and similar names too, and for
  credentials in URLs (`?password=` or `user:pass@`): use a placeholder without a default.
- Profiles are chosen by the environment (`SPRING_PROFILES_ACTIVE`), never with
  `spring.profiles.active` or `spring.profiles.include` in the main file; use
  `spring.profiles.default` for a fallback and `spring.profiles.group` to bundle profiles.
- No `spring.jpa.show-sql=true` (also not as a placeholder default), Hibernate bind logging at
  TRACE (also through `org.hibernate.type` or `root`), `management.endpoint.env.show-values`
  / `configprops.show-values` / `health.show-details` set to `always`, or enabled H2 console
  (local and dev may). `server.error.include-message`, `include-binding-errors` and
  `include-exception` stay off like `include-stacktrace`.
