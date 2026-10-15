# Spring

For a Java project with Spring on its compile classpath (`spring-context` or `spring-boot`):
nitpicker then adds its Spring rules, reported as `pmd/Spring...`, `pmd/Jpa...` and, for the
architecture rules below, `archunit/spring-...`. Write it this way.

Layout (package by feature; the root package is the one of the `@SpringBootApplication` class):

- A feature is `<root>.<feature>` (`com.shop.orders`) with its controller, service, repository and
  entity together. Never `<root>.controller`, `service`, `repository`, `entity`, `model`, `dto`,
  `dao`, `util` or `common`. The root package holds only the application class,
  `@Configuration` classes and `@ConfigurationProperties` records.
- The classes directly in a feature package are its public face. Another feature uses those only,
  never a sub-package such as `orders.internal`. What two features need goes to `<root>.shared`.
  Every root sub-package except `shared` counts as a feature here, technical ones too (`web`,
  `config`, `security`): keep what others use directly in that package.
- `<root>.shared` holds pure utilities: no beans, no entities, no dependency on any feature.
- Controllers call services, never repositories, and take and return records, never an `@Entity`
  (also not inside `List<...>`, in `@ModelAttribute` methods, or in a generated API interface the
  controller implements). Services and repositories know nothing of the web layer: no
  controller, `ResponseEntity` or servlet type.
- A test that starts a Spring context (`@SpringBootTest`, `@DataJpaTest`, `@WebMvcTest`, any
  slice test, `@ExtendWith(SpringExtension.class)`) lives in a package named `integration` or `it`
  (`com.shop.orders.integration`), also when it inherits the annotation from a base class or uses a
  composed annotation. A unit test of a service is `new OrderService(mock(...))`. No
  `@DirtiesContext`.
- When one of these is right for a class, add an `exceptions` entry for `archunit/<rule>` with its
  paths and a reason; do not move code around the rule.

Beans and configuration:

- One constructor, `private final` fields, no `@Autowired`. No `@Inject`, `@Resource` or `@Value`
  on fields or setters. Bean fields are all `final`; keep per-call state in locals.
- No `ApplicationContext`/`BeanFactory` lookups and no `@Lazy` on injection points. Break a cycle
  with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`; `@Bean` methods take their dependencies as
  parameters. No `@ComponentScan` or `scanBasePackages`.
- Configuration comes in through a `@ConfigurationProperties` record. No `@Value` outside
  configuration classes, no `System.getenv`, `System.getProperty` or `Environment.getProperty` in
  beans. `@Profile` only on `@Configuration` classes and `@Bean`
  methods.

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`):

- Only on public, non-final, non-static methods of non-final classes. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a method from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean.
- `@Transactional` goes on services, not controllers. Avoid `Propagation.REQUIRES_NEW`. Inside a
  transactional method, don't catch and swallow `Exception`, `RuntimeException` or persistence
  exceptions; let them propagate.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Records in and out, `@Valid` on every `@RequestBody`.
- No `@CrossOrigin`; CORS is configured once. Passwords through
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`.

JPA and Spring Data:

- Entities are non-final classes (not records), with a `@Version` field next to the `@Id` and
  `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and `@OneToOne` says
  `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and never cascades `ALL`
  or `REMOVE`.
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
  for large inputs). The one loop allowed is the JPA batch loop that calls `persist`, then `flush`
  and `clear` on the `EntityManager`. No other `flush` or `saveAndFlush`.
- Native SQL only when JPQL can't express it, marked on that one method with
  `@SuppressWarnings("PMD.SpringDataNativeQuery")`.

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
- Secrets come from the environment: `password=${DB_PASSWORD}`, with no literal default.
