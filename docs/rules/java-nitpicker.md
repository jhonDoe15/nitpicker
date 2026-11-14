# Java and Kotlin: nitpicker rules

The rules nitpicker adds on top of the JVM tools: ArchUnit architecture rules, Spring configuration findings, the formatter check and the suppression scan, in Java and Kotlin projects. This page lists 52 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `javac`, `forbiddenapis`, `dependencies`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `package-cycle`, `no-production-runtime`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `migration-order`, `migration-hardcoded-name`, `start-schema-push`, `foreign-key-index`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `near-duplicate`, `decided-condition`, `duplicate-branch`, `shared-used-by-one-feature`, `feature-internal-import`, `shared-imports-feature`, `feature-cycle`, `foreign-feature-persistence`, `public-alternative-bypass`, `test-only-export`, `doc-comment-content`, `test-console-output`, `mutable-state-escape`, `context-threading`, `caller-protocol`, `protocol-contract`, `forwarding-chain`, `disjoint-consumer-groups`, `data-clump`, `repeated-policy-decision`, `foreign-state-decision`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven

<a id="archunit-rule"></a>

### `archunit/<rule>`

A rule of the project's own ArchUnit tests.

- **Printed as:** `archunit/<rule>`
- **For example:** `archunit/noCyclesBetweenFeatures`
- **Why it is on:** The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.
- **Allowed form:** Fix the code the rule's message names.
- **Exception:** If this is intended, add `{"rule":"archunit/<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/slice-4-archunit.md)

<a id="archunit-contract-infrastructure-type"></a>

### `archunit/contract-infrastructure-type`

A public method of a `@Service`, a controller, or a public class directly in a feature package takes or returns a persistence handle (JPA `EntityManager`, `EntityManagerFactory`, `EntityTransaction`, `Query`; Hibernate `Session`, `StatelessSession`, `SessionFactory`; JDBC `Connection`, `Statement`, `ResultSet`, `DataSource`; `JdbcTemplate` and the other Spring JDBC, R2DBC and Mongo operations; R2DBC and MongoDB driver types; jOOQ `DSLContext`) or a web request or response object (servlet request, response, session and `Part`; `ServerWebExchange`; `ServerHttpRequest`/`ServerHttpResponse`; `WebRequest`; `MultipartFile`; WebFlux `ServerRequest`/`ServerResponse`; `HttpEntity` and `ResponseEntity`; JAX-RS `Response` and `ContainerRequestContext`; Micronaut `HttpRequest`/`HttpResponse`; Vert.x `RoutingContext`).

- **Scope:** A project with Spring, or with feature folders, in its main sources.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Take a repository or a port interface and return a record (DTO) or a domain type from \<Class>.\<method>: \<PersistenceHandle> is a persistence handle, so every caller of this service depends on the database session. Keep \<PersistenceHandle> inside the repository or adapter that owns the transaction.
- **Exception:** If this is intended, add `{"rule":"archunit/contract-infrastructure-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-aggregate-reference"></a>

### `archunit/ddd-aggregate-reference`

A root or entity of one aggregate holds the root of another (`Customer customer` in `Order`); hold its identifier (`CustomerId`) or an `Association<Customer, CustomerId>`.

- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Refer to \<OtherRoot> by its identifier or an Association\<\<OtherRoot>, ID> in \<Class>: \<OtherRoot> is the root of another aggregate, and holding it lets one aggregate change another outside its consistency boundary.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-aggregate-reference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-foreign-entity"></a>

### `archunit/ddd-foreign-entity`

A root or entity holds an entity that belongs to another aggregate (`List<CartLine>` in `Order` when `CartLine implements Entity<Cart, ...>`), or an `@Entity` that two roots reach (each root is reported, naming the other).

- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Refer to \<Aggregate> by its identifier in \<Class> instead of holding \<Entity>: \<Entity> belongs to the aggregate \<Aggregate>, and an entity belongs to exactly one aggregate.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-foreign-entity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-value-object-reference"></a>

### `archunit/ddd-value-object-reference`

A value object holds an aggregate root or an entity; hold its identifier.

- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Hold the identifier of \<Entity> in \<Class>, not the object: a value object is compared by its values, and \<Entity> is an entity with an identity and lifecycle of its own.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-value-object-reference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-controller"></a>

### `archunit/spring-controller-controller`

A controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`. Naming another controller's class in a link (`methodOn(OrderController.class)`, a `Class<OrderController>`) is fine.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Move what \<Class> needs from \<OtherController> into a service both controllers call: a controller handles its own requests and does not hold another controller.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-controller","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-entity"></a>

### `archunit/spring-controller-entity`

A request-mapping or `@ModelAttribute` method of a controller takes or returns an `@Entity` type, also inside a generic such as `List<Customer>`; methods declared on implemented interfaces (the OpenAPI-generator layout) and inherited from base controllers count.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Take and return a record (DTO) in \<Class>.\<method> and map it in the service: the entity \<Entity> stays out of controller signatures.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-entity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-repository"></a>

### `archunit/spring-controller-repository`

A `@Controller` or `@RestController` depends on a repository (`@Repository`, or a type extending Spring Data's `Repository`) or on data access directly (`JdbcTemplate`, `NamedParameterJdbcTemplate`, `JdbcClient`, `SimpleJdbcInsert`, R2DBC `DatabaseClient`, `JdbcAggregateTemplate`, `R2dbcEntityTemplate`, `MongoTemplate`, `EntityManager`, `EntityManagerFactory`, Hibernate `Session`, `DataSource`, or their interfaces), in a field, parameter, return type or call.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have \<Class> call a service that uses \<Repository>: controllers call services only, not repositories or data access.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-repository","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-feature-boundary"></a>

### `archunit/spring-feature-boundary`

A class uses a class from a sub-package of another root package (`orders.internal.X` from `billing`); the classes directly in the other package are fine.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have \<Class> use only the classes directly in \<root>.\<feature>, or move what both need to \<root>.shared: \<OtherClass> is internal to that feature (\<root>.\<feature>.\<package>).
- **Exception:** If this is intended, add `{"rule":"archunit/spring-feature-boundary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-layout"></a>

### `archunit/spring-layout`

A class sits directly in the root package (only `@SpringBootApplication`, `@Configuration` and `@ConfigurationProperties` classes and a `SpringBootServletInitializer` subclass may), or in a root sub-package named by layer: `controller(s)`, `service(s)`, `repository`/`repositories`, `entity`/`entities`, `model(s)`, `dto(s)`, `dao(s)`, `util(s)`, `common`, `web`, `api`, `rest`, `resource(s)`, `persistence`, `domain`, `mapper(s)`, `exception(s)`, `adapter(s)`, `application`, `infrastructure`, `infra`, `port(s)`, `usecase(s)`, `helper(s)`.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Put \<Class> in the feature package it belongs to, \<root>.\<feature>, which holds that feature's controller, service and repository together (pure utilities go to \<root>.shared); "\<layer>" is a layer package.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-layout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-no-dirties-context"></a>

### `archunit/spring-no-dirties-context`

A test class or method has `@DirtiesContext`, anywhere.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Reset state in \<Name>Test itself, or test the class without a Spring context: @DirtiesContext rebuilds the context and slows the suite.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-no-dirties-context","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-repository-service"></a>

### `archunit/spring-repository-service`

A repository depends on a `@Service`: a field, parameter, return type or call. A repository depending on a controller or the web layer is `spring-service-web`.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have the service call \<Class> and pass it what it needs from \<Service>: a repository only reads and writes data and depends on no service.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-repository-service","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-request-state"></a>

### `archunit/spring-request-state`

Request data reaches a field of a singleton bean or a static field outside set-up: assigned, written into an array element, or passed to a collection, map, `Map.Entry` or `AtomicReference` mutator (`add`, `put`, `computeIfAbsent`, `set`, ...).

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Pass the request data from \<request source> on through parameters and return values instead of passing it to \<Class>.\<field> with \<mutator>(): \<Class> is a singleton that every request shares, so request data kept there leaks between users and races between threads. Per-request data belongs in a @RequestScope bean, and a cache needs a size and an expiry (Spring Cache, Caffeine).
- **Exception:** If this is intended, add `{"rule":"archunit/spring-request-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-scope-capture"></a>

### `archunit/spring-scope-capture`

A singleton bean (a `@Component` class or a `@Bean` method without `@Scope`, or with `singleton` or `application` scope) takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy: in a constructor or `@Bean` method parameter, an `@Autowired`, `@Inject` or `@Resource` field or method, also as `Optional<T>`, an array or a collection or map of them.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Inject ObjectProvider\<\<ScopedBean>> into \<Class> and call getObject() per use, or give \<ScopedBean> a scoped proxy (proxyMode = ScopedProxyMode.TARGET_CLASS): a singleton gets one \<ScopedBean> when it is created, which fails outside a \<scope> and otherwise keeps the first \<scope>'s bean.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-scope-capture","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-service-web"></a>

### `archunit/spring-service-web`

A `@Service` or repository depends on the web layer: a controller or `@ControllerAdvice`, `ResponseEntity` in its own field, method or constructor signatures (not a `RestTemplate` or `RestClient` result it unwraps), or the `jakarta.servlet`, `javax.servlet`, `org.springframework.web.bind`, `org.springframework.web.servlet`, `org.springframework.web.multipart`, `org.springframework.web.context.request` (`RequestContextHolder`, `WebRequest`), `org.springframework.web.server` (`ServerWebExchange`, `ResponseStatusException`), `org.springframework.web.reactive` or `org.springframework.http.server` packages, so servlet and WebFlux apps are held to the same rule.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Keep \<Class> free of web types: take and return plain values, throw a domain exception for errors, and map them to and from \<WebType> in the controller or a @ControllerAdvice.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-service-web","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-shared-pure"></a>

### `archunit/spring-shared-pure`

A `shared` class is a Spring bean (`@Component` and its stereotypes, `@Configuration`) or an `@Entity`, or depends on a class in any other root package.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Move \<Class> into the package that uses it, or drop its use of \<OtherClass>: \<root>.shared holds pure utilities and depends on no feature package such as \<root>.\<feature>.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-shared-pure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-test-placement"></a>

### `archunit/spring-test-placement`

Such a test is in the unit test source set (`test` on Gradle, the one test source directory on Maven) and is not an integration test by the shared rule of the [slow-test check](../java-preset/slow-tests.md): a class named `*IT`, `*ITCase`, `*IntegrationTest(s)`, `*IntegrationSpec` or `*ISpec`, or a package with an `integration`, `it` or `e2e` segment. The message offers the forms that keep the package (an `*IT` name, an integration test source set), so a slice test of a package-private controller still compiles; plain unit tests live anywhere.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Test \<Name>Test with new and mocks, or run it as an integration test: name it \<Name>IT (Failsafe runs \*IT on Maven) or put it in an integration test source set. Both keep its package, so package-private classes stay visible; a package named integration or it also counts.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-test-placement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-typed-request-field"></a>

### `archunit/spring-typed-request-field`

A project type that a controller binds from the request (a `@RequestBody`, `@RequestPart`, `@ModelAttribute` or `HttpEntity` parameter, or the payload of a `@MessageMapping` or `@SubscribeMapping` method) has a field typed `Object`, `JsonNode` (or a subtype such as `ObjectNode`), a `Map` whose values are `Object` or `?`, a raw `Map` or collection, a project class extending `HashMap<String, Object>`, or a collection, array, `Optional` or map of those, or a `@JsonAnySetter` method or field, also in a nested type.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Type \<Type>.\<field> with a record or an enum and validate it: \<Controller>.\<method> binds it from the request, and an Object, JsonNode or Map\<String, Object> field, or a collection of those, skips validation and lets a client send any shape. A Map with typed values, such as Map\<String, String>, is fine.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-typed-request-field","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-unmapped-exception"></a>

### `archunit/spring-unmapped-exception`

A handler method of a controller (a `@RequestMapping` or composed mapping on the method, its superclass or interface) can throw a project exception class that no `@ExceptionHandler` maps, that carries no `@ResponseStatus` (on it or a superclass) and that is no `ResponseStatusException` or `ErrorResponse`; one finding per handler and exception class.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Map \<Exception> to a status: \<Class>.\<method> can throw it (through \<Service>.\<method>), and no @ExceptionHandler, @ResponseStatus or ResponseStatusException maps it, so the client gets a 500. Add an @ExceptionHandler for it (or a base class) in a @RestControllerAdvice, or annotate it with @ResponseStatus. An exception fits a class that only signals a server fault.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-unmapped-exception","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="dependencies-unused-declared-dependency"></a>

### `dependencies/unused-declared-dependency`

A dependency declared for the main sources that no main class uses.

- **Why it is on:** A dependency nothing uses widens the class path and the attack surface, and the build still resolves it on every run.
- **Allowed form:** Remove it, or declare it where it is used: testImplementation, runtimeOnly or compileOnly (Maven: test, runtime or provided scope).
- **Exception:** If this is intended, add `{"rule":"dependencies/unused-declared-dependency","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="errorprone-inlinesuppression"></a>

### `errorprone/InlineSuppression`

An inline suppression of errorprone in a Java source.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence Error Prone or NullAway inline: fix the finding (for NullAway, annotate what may be null with @Nullable).
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="forbiddenapis-clock-now"></a>

### `forbiddenapis/clock-now`

A `now()` call of a `java.time` class that takes no `Clock`.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Inject a java.time.Clock and call now(clock), so the code can be tested with a fixed time.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/clock-now","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-java-deserialization"></a>

### `forbiddenapis/java-deserialization`

A `new ObjectInputStream`, which reads Java-serialized objects.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not read Java-serialized objects. Use JSON or another data format.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/java-deserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-legacy-date-time"></a>

### `forbiddenapis/legacy-date-time`

A call of the legacy date classes: `Date`, `Calendar`, `TimeZone` or `SimpleDateFormat`.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Use java.time (Instant, LocalDate, ZonedDateTime, ZoneId and DateTimeFormatter) instead of the legacy date classes. Convert a Date another API returns with toInstant() in the same expression.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/legacy-date-time","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-new-thread"></a>

### `forbiddenapis/new-thread`

A `Thread.start` call, which starts a thread by hand.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not start threads by hand. Submit the work to an injected ExecutorService (a ThreadFactory or a shutdown hook may still create the Thread).
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/new-thread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-runtime-exec"></a>

### `forbiddenapis/runtime-exec`

A `Runtime.exec` call that runs a command string.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Run commands with ProcessBuilder and an argument list, never a command string.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/runtime-exec","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-thread-sleep"></a>

### `forbiddenapis/thread-sleep`

A `Thread.sleep` or `TimeUnit.sleep` call in main code.

- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not sleep in production code. Schedule the work (ScheduledExecutorService) or wait on the condition.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/thread-sleep","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="google-java-format-format"></a>

### `google-java-format/format`

A Java file is not formatted with google-java-format.

- **Why it is on:** The Java presets keep one layout, the formatter's. google-java-format runs in check mode and reports every file it would change.
- **Allowed form:** File is not formatted with google-java-format. Run nitpicker --fix, or format it with google-java-format --replace \<Java files>. Not your formatter: pin "conventions.java.formatter" to "google", "palantir", "spring" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"google-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/style.md)

<a id="javac-cast"></a>

### `javac/cast`

A cast to the type the expression already has.

- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Remove the cast.
- **Exception:** If this is intended, add `{"rule":"javac/cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-deprecation"></a>

### `javac/deprecation`

A call of an API marked `@Deprecated`.

- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Call the replacement named in the API's Javadoc.
- **Exception:** If this is intended, add `{"rule":"javac/deprecation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-rawtypes"></a>

### `javac/rawtypes`

A generic type used without its type arguments.

- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Add the type arguments, as in List\<String>.
- **Exception:** If this is intended, add `{"rule":"javac/rawtypes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-removal"></a>

### `javac/removal`

A call of an API marked `@Deprecated(forRemoval = true)`.

- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Call the replacement named in the API's Javadoc; this API is going to be removed.
- **Exception:** If this is intended, add `{"rule":"javac/removal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-unchecked"></a>

### `javac/unchecked`

An operation javac cannot check at compile time, such as an unchecked cast.

- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Use a typed API, a checked conversion or a generic method instead of the unchecked operation.
- **Exception:** If this is intended, add `{"rule":"javac/unchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="palantir-java-format-format"></a>

### `palantir-java-format/format`

A Java file is not formatted with palantir-java-format.

- **Why it is on:** The Java presets keep one layout, the formatter's. palantir-java-format runs in check mode and reports every file it would change.
- **Allowed form:** File is not formatted with palantir-java-format. Run nitpicker --fix, or format it with palantir-java-format --palantir --replace \<Java files>. Not your formatter: pin "conventions.java.formatter" to "google", "palantir", "spring" or "none" in nitpicker.config.json.
- **Exception:** If this is intended, add `{"rule":"palantir-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/style.md)

<a id="pmd-commentedoutcode"></a>

### `pmd/CommentedOutCode`

A comment in a Java source whose lines read as Java statements or declarations.

- **Why it is on:** Commented-out code goes stale and hides what is live; version control keeps the old version.
- **Allowed form:** Delete the commented-out code; version control keeps it.
- **Exception:** If this is intended, add `{"rule":"pmd/CommentedOutCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-copiedconstantintest"></a>

### `pmd/CopiedConstantInTest`

A string or number literal in a test that equals an `UPPER_SNAKE` constant of a main-source class, object or file the test can see.

- **Why it is on:** When the constant changes, a test that holds a copy of its value keeps checking the old value, or a boundary test stops testing the boundary. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.
- **Allowed form:** This literal copies \<Owner>.\<NAME> from \<file>: when \<Owner>.\<NAME> changes, the test keeps checking the old value or stops testing the case it was written for. Use \<Owner>.\<NAME> (or an expression on it, such as \<Owner>.\<NAME> + 1). If the value is a contract the test pins on purpose, assert it next to the constant: assertEquals(\<value>, \<Owner>.\<NAME>).
- **Exception:** If this is intended, add `{"rule":"pmd/CopiedConstantInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/tests-that-copy-a-constant.md), [TypeScript and JavaScript counterpart `nitpicker/no-copied-constant`](typescript-nitpicker.md#eslint-nitpicker-no-copied-constant), [Python counterpart `copied-constant-in-test`](python-nitpicker.md#python-rules-copied-constant-in-test), [Go counterpart `go-rules/copied-constant-in-test`](../go-preset.md#own-rules)

<a id="pmd-inlinesuppression"></a>

### `pmd/InlineSuppression`

An inline suppression of pmd in a Java source.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence PMD inline: fix the finding. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.
- **Exception:** If this is intended, add `{"rule":"pmd/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-todowithoutissue"></a>

### `pmd/TodoWithoutIssue`

A `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` comment in a Java source with no issue reference.

- **Why it is on:** A task marker without an issue is never picked up, so it stays in the code for good.
- **Allowed form:** A TODO or FIXME needs an issue reference: write `TODO(#123): ...` or `TODO PROJ-123: ...`, or do the work now.
- **Exception:** If this is intended, add `{"rule":"pmd/TodoWithoutIssue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-untestedroundtrip"></a>

### `pmd/UntestedRoundTrip`

Two public methods of one main-source class or file that turn values into each other (`toJson`/`fromJson`, `encode`/`decode`), with no test that calls both.

- **Why it is on:** A field that one half drops or garbles passes every test that checks each half alone. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.
- **Allowed form:** \<Owner>.\<encode> and \<Owner>.\<decode> turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: assertEquals(value, \<Owner>.\<decode>(\<Owner>.\<encode>(value))), with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).
- **Exception:** If this is intended, add `{"rule":"pmd/UntestedRoundTrip","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/round-trip-tests.md)

<a id="spotbugs-inlinesuppression"></a>

### `spotbugs/InlineSuppression`

An inline suppression of spotbugs in a Java source.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence SpotBugs inline: fix the bug.
- **Exception:** If this is intended, add `{"rule":"spotbugs/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spring-active-profile"></a>

### `spring/active-profile`

`spring.profiles.active` or `spring.profiles.include` with a literal value in the main (profile-less) document, one finding per line.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/active-profile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.profiles.active`: Set SPRING_PROFILES_ACTIVE in each deployment instead, or spring.profiles.default for a fallback that a deployment can override. spring.profiles.active in the packaged main file turns those profiles on in every environment.
  - `spring.profiles.include`: Name them in a spring.profiles.group entry instead, and activate that group with SPRING_PROFILES_ACTIVE in each deployment. spring.profiles.include in the packaged main file turns those profiles on in every environment.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-actuator-exposure"></a>

### `spring/actuator-exposure`

`management.endpoints.web.exposure.include` containing `*` or a sensitive endpoint (below); `management.endpoints.access.default=unrestricted`; `management.endpoint.shutdown.access=unrestricted`; `management.endpoint.heapdump.access` `read-only` or `unrestricted`; `management.endpoint.shutdown.enabled` or `management.endpoints.enabled-by-default` true.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/actuator-exposure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `management.endpoints.web.exposure.include`: List only the actuator endpoints you need in management.endpoints.web.exposure.include, for example health,info; \* exposes every endpoint.
  - `management.endpoints.access.default`: Leave management.endpoints.access.default unset, or set it to read-only, and open single endpoints with management.endpoint.\<id>.access; unrestricted also opens the shutdown and heapdump endpoints.
  - `management.endpoint.heapdump.access`: Set management.endpoint.heapdump.access to none, or remove it; unrestricted lets callers stop the application or download its memory.
  - `management.endpoint.shutdown.enabled`: Remove management.endpoint.shutdown.enabled=true; it turns the shutdown endpoint on.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-datasource-without-timeout"></a>

### `spring/datasource-without-timeout`

`spring.datasource.url` or `spring.datasource.hikari.jdbc-url` naming a database server (an H2, HSQLDB, Derby, SQLite or Testcontainers `jdbc:tc:` URL is skipped) while no live profile sets a non-zero query deadline: `spring.jpa.properties.jakarta.persistence.query.timeout` (or `javax`), `spring.transaction.default-timeout`, `spring.jdbc.template.query-timeout`, `spring.datasource.dbcp2.default-query-timeout`, a Hikari `data-source-properties.socketTimeout` or `oracle.jdbc.ReadTimeout`, a Hikari `data-source-properties.options` or `connection-init-sql` or a Tomcat pool `connection-properties` or `init-sql` that sets `statement_timeout`, `max_execution_time`, `socketTimeout` or `queryTimeout`, or a URL that carries one of them; one deadline in any live profile covers every URL; a zero, `-1` or `PT0S` value sets no limit; a DataSource built in code is left out; one finding per URL line.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/datasource-without-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.datasource.url`: Set a deadline for database queries, such as spring.jpa.properties.jakarta.persistence.query.timeout=30000 or socketTimeout in the JDBC URL; without one a stuck query holds its request and pool connection for good.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-ddl-auto"></a>

### `spring/ddl-auto`

`spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` other than `none`/`validate`, or `spring.jpa.generate-ddl` true.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/ddl-auto","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.hibernate.ddl-auto`: Manage the schema with Flyway or Liquibase and set spring.jpa.hibernate.ddl-auto to none or validate; other modes let Hibernate change the schema.
  - `spring.jpa.generate-ddl`: Manage the schema with Flyway or Liquibase and keep spring.jpa.generate-ddl false; true lets Hibernate change the schema.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-error-details"></a>

### `spring/error-details`

`server.error.include-stacktrace`, `include-message` or `include-binding-errors` set to `always` or `on-param`; `include-exception` true; also as a placeholder default (`${X:always}`).

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/error-details","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `server.error.include-stacktrace`: Set server.error.include-stacktrace=never; other values send stack traces to clients.
  - `server.error.include-message`: Set server.error.include-message=never and return a fixed ProblemDetail from a @RestControllerAdvice; other values send exception messages to clients.
  - `server.error.include-binding-errors`: Set server.error.include-binding-errors=never and report field errors from a @RestControllerAdvice; other values send rejected values to clients.
  - `server.error.include-exception`: Set server.error.include-exception=false; true sends exception class names to clients.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-literal-secret"></a>

### `spring/literal-secret`

A literal value under a key whose last segment is, or ends in a separate word that is, a secret word (below).

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/literal-secret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.datasource.password`: Set SPRING_DATASOURCE_PASSWORD in the environment, or read it from a secret store, and remove the literal secret from spring.datasource.password.
  - `spring.datasource.url`: Supply the credential in spring.datasource.url from the environment, for example through a placeholder without a default, and take it out of the URL.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-missing-enable"></a>

### `spring/missing-enable`

`@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and friends, or `@Retryable` used in Java or Kotlin while no main class has the matching `@Enable...` and no XML `annotation-driven` element enables it.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** An annotation such as `@Scheduled` or `@Async` does nothing until the matching `@Enable...` is present, and Spring raises no error when it is missing.
- **Exception:** If this is intended, add `{"rule":"spring/missing-enable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `enable-scheduling`: Add @EnableScheduling to one @Configuration class; without it @Scheduled does nothing.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-open-in-view"></a>

### `spring/open-in-view`

JPA in the main sources (`jakarta.persistence` or `javax.persistence` import) and `spring.jpa.open-in-view` unset, or true.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/open-in-view","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.open-in-view`: Set spring.jpa.open-in-view=false. Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-risky-startup-flags"></a>

### `spring/risky-startup-flags`

`spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` true.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/risky-startup-flags","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.main.allow-circular-references`: Remove spring.main.allow-circular-references=true and restructure the beans; the flag hides wiring problems instead of fixing them.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-unbound-property"></a>

### `spring/unbound-property`

A key in an `application*` file (main or test resources) or a test override (`@SpringBootTest` and slice `properties`, `@TestPropertySource(properties)`, `TestPropertyValues`, `withPropertyValues`, `DynamicPropertyRegistry.add`) that binds to no known property, under a group that is described; see below.

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Spring ignores a key that binds to no property, so a misspelled or removed setting silently never takes effect.
- **Exception:** If this is intended, add `{"rule":"spring/unbound-property","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.datasource.user`: spring.datasource.user binds to no property, so Spring ignores it; did you mean spring.datasource.username? Declare a key that code reads by name in META-INF/additional-spring-configuration-metadata.json.
  - `spring.redis.host`: spring.redis.host was removed from Spring Boot and binds to nothing; use spring.data.redis.host.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-unsafe-diagnostics"></a>

### `spring/unsafe-diagnostics`

`spring.jpa.show-sql` or `spring.jpa.properties.hibernate.show_sql` true; Hibernate bind logging (`org.hibernate.orm.jdbc.bind`, `orm.jdbc.extract`, `type.descriptor.sql`, any parent such as `org.hibernate.type`, and `root`) at TRACE or ALL; `management.endpoint.env.show-values`, `configprops.show-values`, `health.show-details` or `health.show-components` `always`; `spring.h2.console.enabled` or `settings.web-allow-others` true; also as a placeholder default (`${SHOW_SQL:true}`).

- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/unsafe-diagnostics","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.show-sql`: Log SQL with the logging.level.org.hibernate.SQL logger in a local profile and remove spring.jpa.show-sql=true, which prints SQL to standard output, outside logging.
  - `logging.level.org.hibernate.orm.jdbc.bind`: Leave logging.level.org.hibernate.orm.jdbc.bind at its default level; trace logs bound SQL values, including passwords and personal data.
  - `spring.h2.console.enabled`: Enable spring.h2.console.enabled only in a local profile; it opens the H2 web console.
  - `management.endpoint.env.show-values`: Set management.endpoint.env.show-values to when-authorized or never; always serves internals to every caller.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="test-runtime-test-not-run"></a>

### `test-runtime/test-not-run`

A test class that no Test task or Failsafe execution runs.

- **Why it is on:** A test that never runs cannot fail, so it proves nothing.
- **Exception:** If this is intended, add `{"rule":"test-runtime/test-not-run","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `Gradle`: Register a Test task for the \<sourceSet> source set (testClassesDirs = sourceSets.\<sourceSet>.output.classesDirs, classpath = sourceSets.\<sourceSet>.runtimeClasspath) so \<Test> runs: no test task runs that source set, so its tests never run.
  - `Maven`: Bind the integration-test and verify goals of maven-failsafe-plugin in this module so \<Test>IT runs: Surefire skips classes named IT\*, \*IT and \*ITCase, and Failsafe does not run here, so its tests never run.
- **See also:** [Java preset guide](../java-preset/tests-that-never-run.md)
