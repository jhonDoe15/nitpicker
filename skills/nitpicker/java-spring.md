# Java and Spring

For a project with `"preset": "java"` in `nitpicker.config.json`. The TypeScript sections of
SKILL.md don't apply; this page does.

## Finish with the gate

1. Run the tests (`./gradlew test` or `gradle test`). Failing tests stop coverage, CRAP and mutation.
2. When the change is complete, run `npx nitpicker` as a background command you wait on, without a
   pipe. It runs Gradle with its own init script on the merge base and on your change, which takes
   minutes. Exit codes are the same as for TypeScript: 0 done, 1 fix the new findings and rerun, 2 a
   tool failed (usually compilation or a test), never a pass.
3. Never suppress: no `@SuppressWarnings("PMD...")`, `@SuppressWarnings("all")` or `// NOPMD`
   (each is a finding), no config `exclude`, `exceptions` or legacy entries. If a finding seems
   wrong, stop and ask. The one exception is native SQL, below.

## Spring: write it this way

Beans and configuration:

- One constructor, `private final` fields, no `@Autowired`. No `@Inject`, `@Resource` or `@Value`
  on fields or setters. Bean fields are all `final`; keep per-call state in locals.
- No `ApplicationContext`/`BeanFactory` lookups and no `@Lazy` on injection points. Break a cycle
  with a new component or an event.
- `@Configuration(proxyBeanMethods = false)`; `@Bean` methods take their dependencies as
  parameters. No `@ComponentScan` or `scanBasePackages`.
- Configuration comes in through a `@ConfigurationProperties` record with `@Validated`. No `@Value`
  outside `@Configuration` classes, no `System.getenv`, `System.getProperty` or
  `Environment.getProperty` in beans. `@Profile` only on `@Configuration` classes and `@Bean`
  methods.

Transactions and other proxies (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`,
`@PreAuthorize`):

- Only on public, non-final methods of concrete classes, never on interfaces. Use Spring's
  `org.springframework.transaction.annotation.Transactional`.
- Never call such a method from the same class: the proxy is skipped and the annotation does
  nothing. Put it in another bean.
- `@Transactional` goes on services, not controllers. No `Propagation.REQUIRES_NEW`. Don't catch
  and swallow exceptions inside a transactional method; let them propagate.
- `@Async("executorName")` returning `CompletableFuture`. `@Scheduled` with `fixedDelay` or `cron`,
  not `fixedRate`.

Web:

- `@RestController`, composed mappings (`@GetMapping`, `@PostMapping`, ...); `@RequestMapping` only
  on the class for the path prefix. Records in and out, `@Valid` on every `@RequestBody`.
- No `@CrossOrigin`; CORS is configured once. Passwords through
  `PasswordEncoderFactories.createDelegatingPasswordEncoder()`.

JPA and Spring Data:

- Entities are plain non-final classes with a protected no-argument constructor, a `@Version`
  field and `GenerationType.SEQUENCE` ids. Every `@ManyToOne` and `@OneToOne` says
  `fetch = FetchType.LAZY`; nothing is `EAGER`. `@ManyToMany` is a `Set` and cascades only
  `PERSIST` and `MERGE`.
- Every repository method you declare has `@Query` with JPQL in a text block and named parameters
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
- Never `save`, `delete` or `persist` one entity per loop iteration: call `saveAll` once, or change
  managed entities inside one transaction. No `flush` or `saveAndFlush`.
- Native SQL only when JPQL can't express it, marked on that one method with
  `@SuppressWarnings("PMD.SpringDataNativeQuery")`.
