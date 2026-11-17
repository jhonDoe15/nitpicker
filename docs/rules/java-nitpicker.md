# Java and Kotlin: nitpicker rules

The rules nitpicker adds on top of the JVM tools: ArchUnit architecture rules, Spring configuration findings, the formatter check and the suppression scan, in Java and Kotlin projects. This page lists 74 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

In the Java preset, an entry of `exceptions` names a finding as it prints, `<tool>/<rule>` with one of the tools `pmd`, `spotbugs`, `errorprone`, `archunit`, `effects`, `google-java-format`, `palantir-java-format`, `jacoco`, `checkstyle`, `crap`, `duplicates`, `pit`, `structure`, `coupling`, `javac`, `forbiddenapis`, `dependencies`, `spring` and `test-runtime`, or one of these rules: `function-lines-limit`, `function-statements-limit`, `function-control-nesting-limit`, `function-parameters-limit`, `crap-score-limit`, `crap-coverage-unknown`, `changed-branch-coverage`, `mutant-survived`, `mutant-nocoverage`, `duplicate-clone`, `stability-direction`, `package-cycle`, `no-production-runtime`, `file-lines-limit`, `line-length-limit`, `folder-files-limit`, `slow-test`, `committed-env-file`, `committed-private-key`, `committed-binary`, `large-file`, `committed-build-output`, `migration-order`, `migration-hardcoded-name`, `start-schema-push`, `foreign-key-index`, `field-limit-mismatch`, `co-change`, `duplicate-definition`, `exported-name-collision`, `sibling-copy-edit`, `near-duplicate`, `decided-condition`, `duplicate-branch`, `result-slip`, `integer-slip`, `shorter-condition`, `shared-used-by-one-feature`, `feature-internal-import`, `shared-imports-feature`, `feature-cycle`, `foreign-feature-persistence`, `public-alternative-bypass`, `test-only-export`, `doc-comment-content`, `test-console-output`, `mutable-state-escape`, `context-threading`, `caller-protocol`, `protocol-contract`, `forwarding-chain`, `disjoint-consumer-groups`, `data-clump`, `repeated-policy-decision`, `foreign-state-decision`, `folder-depth-limit`, `class-methods-limit`, `class-fields-limit` and `inheritance-depth-limit`. The Kotlin preset takes the same `<tool>/<rule>` form for the Java sources of a mixed module.

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven
- **Fix:** None: fix it by hand.

<a id="archunit-rule"></a>

### `archunit/<rule>`

A rule of the project's own ArchUnit tests.

- **Labels:** maintainability
- **Printed as:** `archunit/<rule>`
- **For example:** `archunit/noCyclesBetweenFeatures`
- **Why it is on:** The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.
- **Allowed form:** Fix the code the rule's message names.
- **Exception:** If this is intended, add `{"rule":"archunit/<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/slice-4-archunit.md)

<a id="archunit-contract-infrastructure-type"></a>

### `archunit/contract-infrastructure-type`

A public method of a `@Service`, a controller, or a public class directly in a feature package takes or returns a persistence handle (JPA `EntityManager`, `EntityManagerFactory`, `EntityTransaction`, `Query`; Hibernate `Session`, `StatelessSession`, `SessionFactory`; JDBC `Connection`, `Statement`, `ResultSet`, `DataSource`; `JdbcTemplate` and the other Spring JDBC, R2DBC and Mongo operations; R2DBC and MongoDB driver types; jOOQ `DSLContext`) or a web request or response object (servlet request, response, session and `Part`; `ServerWebExchange`; `ServerHttpRequest`/`ServerHttpResponse`; `WebRequest`; `MultipartFile`; WebFlux `ServerRequest`/`ServerResponse`; `HttpEntity` and `ResponseEntity`; JAX-RS `Response` and `ContainerRequestContext`; Micronaut `HttpRequest`/`HttpResponse`; Vert.x `RoutingContext`).

- **Labels:** maintainability, spring
- **Scope:** A project with Spring, or with feature folders, in its main sources.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Take a repository or a port interface and return a record (DTO) or a domain type from \<Class>.\<method>: \<PersistenceHandle> is a persistence handle, so every caller of this service depends on the database session. Keep \<PersistenceHandle> inside the repository or adapter that owns the transaction.
- **Exception:** If this is intended, add `{"rule":"archunit/contract-infrastructure-type","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-aggregate-reference"></a>

### `archunit/ddd-aggregate-reference`

A root or entity of one aggregate holds the root of another (`Customer customer` in `Order`); hold its identifier (`CustomerId`) or an `Association<Customer, CustomerId>`.

- **Labels:** maintainability
- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Refer to \<OtherRoot> by its identifier or an Association\<\<OtherRoot>, ID> in \<Class>: \<OtherRoot> is the root of another aggregate, and holding it lets one aggregate change another outside its consistency boundary.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-aggregate-reference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-foreign-entity"></a>

### `archunit/ddd-foreign-entity`

A root or entity holds an entity that belongs to another aggregate (`List<CartLine>` in `Order` when `CartLine implements Entity<Cart, ...>`), or an `@Entity` that two roots reach (each root is reported, naming the other).

- **Labels:** maintainability, persistence
- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Refer to \<Aggregate> by its identifier in \<Class> instead of holding \<Entity>: \<Entity> belongs to the aggregate \<Aggregate>, and an entity belongs to exactly one aggregate.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-foreign-entity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-ddd-value-object-reference"></a>

### `archunit/ddd-value-object-reference`

A value object holds an aggregate root or an entity; hold its identifier.

- **Labels:** maintainability
- **Scope:** A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Hold the identifier of \<Entity> in \<Class>, not the object: a value object is compared by its values, and \<Entity> is an entity with an identity and lifecycle of its own.
- **Exception:** If this is intended, add `{"rule":"archunit/ddd-value-object-reference","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-controller"></a>

### `archunit/spring-controller-controller`

A controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`. Naming another controller's class in a link (`methodOn(OrderController.class)`, a `Class<OrderController>`) is fine.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Move what \<Class> needs from \<OtherController> into a service both controllers call: a controller handles its own requests and does not hold another controller.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-controller","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-entity"></a>

### `archunit/spring-controller-entity`

A request-mapping or `@ModelAttribute` method of a controller takes or returns an `@Entity` type, also inside a generic such as `List<Customer>`; methods declared on implemented interfaces (the OpenAPI-generator layout) and inherited from base controllers count.

- **Labels:** maintainability, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Take and return a record (DTO) in \<Class>.\<method> and map it in the service: the entity \<Entity> stays out of controller signatures.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-entity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-controller-repository"></a>

### `archunit/spring-controller-repository`

A `@Controller` or `@RestController` depends on a repository (`@Repository`, or a type extending Spring Data's `Repository`) or on data access directly (`JdbcTemplate`, `NamedParameterJdbcTemplate`, `JdbcClient`, `SimpleJdbcInsert`, R2DBC `DatabaseClient`, `JdbcAggregateTemplate`, `R2dbcEntityTemplate`, `MongoTemplate`, `EntityManager`, `EntityManagerFactory`, Hibernate `Session`, `DataSource`, or their interfaces), in a field, parameter, return type or call.

- **Labels:** maintainability, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have \<Class> call a service that uses \<Repository>: controllers call services only, not repositories or data access.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-repository","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-feature-boundary"></a>

### `archunit/spring-feature-boundary`

A class uses a class from a sub-package of another root package (`orders.internal.X` from `billing`); the classes directly in the other package are fine.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have \<Class> use only the classes directly in \<root>.\<feature>, or move what both need to \<root>.shared: \<OtherClass> is internal to that feature (\<root>.\<feature>.\<package>).
- **Exception:** If this is intended, add `{"rule":"archunit/spring-feature-boundary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-layout"></a>

### `archunit/spring-layout`

A class sits directly in the root package (only `@SpringBootApplication`, `@Configuration` and `@ConfigurationProperties` classes and a `SpringBootServletInitializer` subclass may), or in a root sub-package named by layer: `controller(s)`, `service(s)`, `repository`/`repositories`, `entity`/`entities`, `model(s)`, `dto(s)`, `dao(s)`, `util(s)`, `common`, `web`, `api`, `rest`, `resource(s)`, `persistence`, `domain`, `mapper(s)`, `exception(s)`, `adapter(s)`, `application`, `infrastructure`, `infra`, `port(s)`, `usecase(s)`, `helper(s)`.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Put \<Class> in the feature package it belongs to, \<root>.\<feature>, which holds that feature's controller, service and repository together (pure utilities go to \<root>.shared); "\<layer>" is a layer package.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-layout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-no-dirties-context"></a>

### `archunit/spring-no-dirties-context`

A test class or method has `@DirtiesContext`, anywhere.

- **Labels:** tests, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Reset state in \<Name>Test itself, or test the class without a Spring context: @DirtiesContext rebuilds the context and slows the suite.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-no-dirties-context","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-repository-service"></a>

### `archunit/spring-repository-service`

A repository depends on a `@Service`: a field, parameter, return type or call. A repository depending on a controller or the web layer is `spring-service-web`.

- **Labels:** maintainability, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Have the service call \<Class> and pass it what it needs from \<Service>: a repository only reads and writes data and depends on no service.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-repository-service","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-request-state"></a>

### `archunit/spring-request-state`

Request data reaches a field of a singleton bean or a static field outside set-up: assigned, written into an array element, or passed to a collection, map, `Map.Entry` or `AtomicReference` mutator (`add`, `put`, `computeIfAbsent`, `set`, ...).

- **Labels:** bug, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Pass the request data from \<request source> on through parameters and return values instead of passing it to \<Class>.\<field> with \<mutator>(): \<Class> is a singleton that every request shares, so request data kept there leaks between users and races between threads. Per-request data belongs in a @RequestScope bean, and a cache needs a size and an expiry (Spring Cache, Caffeine).
- **Exception:** If this is intended, add `{"rule":"archunit/spring-request-state","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-scope-capture"></a>

### `archunit/spring-scope-capture`

A singleton bean (a `@Component` class or a `@Bean` method without `@Scope`, or with `singleton` or `application` scope) takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy: in a constructor or `@Bean` method parameter, an `@Autowired`, `@Inject` or `@Resource` field or method, also as `Optional<T>`, an array or a collection or map of them.

- **Labels:** bug, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Inject ObjectProvider\<\<ScopedBean>> into \<Class> and call getObject() per use, or give \<ScopedBean> a scoped proxy (proxyMode = ScopedProxyMode.TARGET_CLASS): a singleton gets one \<ScopedBean> when it is created, which fails outside a \<scope> and otherwise keeps the first \<scope>'s bean.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-scope-capture","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-service-web"></a>

### `archunit/spring-service-web`

A `@Service` or repository depends on the web layer: a controller or `@ControllerAdvice`, `ResponseEntity` in its own field, method or constructor signatures (not a `RestTemplate` or `RestClient` result it unwraps), or the `jakarta.servlet`, `javax.servlet`, `org.springframework.web.bind`, `org.springframework.web.servlet`, `org.springframework.web.multipart`, `org.springframework.web.context.request` (`RequestContextHolder`, `WebRequest`), `org.springframework.web.server` (`ServerWebExchange`, `ResponseStatusException`), `org.springframework.web.reactive` or `org.springframework.http.server` packages, so servlet and WebFlux apps are held to the same rule.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Keep \<Class> free of web types: take and return plain values, throw a domain exception for errors, and map them to and from \<WebType> in the controller or a @ControllerAdvice.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-service-web","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-shared-pure"></a>

### `archunit/spring-shared-pure`

A `shared` class is a Spring bean (`@Component` and its stereotypes, `@Configuration`) or an `@Entity`, or depends on a class in any other root package.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Move \<Class> into the package that uses it, or drop its use of \<OtherClass>: \<root>.shared holds pure utilities and depends on no feature package such as \<root>.\<feature>.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-shared-pure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-test-placement"></a>

### `archunit/spring-test-placement`

Such a test is in the unit test source set (`test` on Gradle, the one test source directory on Maven) and is not an integration test by the shared rule of the [slow-test check](../java-preset/slow-tests.md): a class named `*IT`, `*ITCase`, `*IntegrationTest(s)`, `*IntegrationSpec` or `*ISpec`, or a package with an `integration`, `it` or `e2e` segment. The message offers the forms that keep the package (an `*IT` name, an integration test source set), so a slice test of a package-private controller still compiles; plain unit tests live anywhere.

- **Labels:** tests, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Test \<Name>Test with new and mocks, or run it as an integration test: name it \<Name>IT (Failsafe runs \*IT on Maven) or put it in an integration test source set. Both keep its package, so package-private classes stay visible; a package named integration or it also counts.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-test-placement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-typed-request-field"></a>

### `archunit/spring-typed-request-field`

A project type that a controller binds from the request (a `@RequestBody`, `@RequestPart`, `@ModelAttribute` or `HttpEntity` parameter, or the payload of a `@MessageMapping` or `@SubscribeMapping` method) has a field typed `Object`, `JsonNode` (or a subtype such as `ObjectNode`), a `Map` whose values are `Object` or `?`, a raw `Map` or collection, a project class extending `HashMap<String, Object>`, or a collection, array, `Optional` or map of those, or a `@JsonAnySetter` method or field, also in a nested type.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Type \<Type>.\<field> with a record or an enum and validate it: \<Controller>.\<method> binds it from the request, and an Object, JsonNode or Map\<String, Object> field, or a collection of those, skips validation and lets a client send any shape. A Map with typed values, such as Map\<String, String>, is fine.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-typed-request-field","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="archunit-spring-unmapped-exception"></a>

### `archunit/spring-unmapped-exception`

A handler method of a controller (a `@RequestMapping` or composed mapping on the method, its superclass or interface) can throw a project exception class that no `@ExceptionHandler` maps, that carries no `@ResponseStatus` (on it or a superclass) and that is no `ResponseStatusException` or `ErrorResponse`; one finding per handler and exception class.

- **Labels:** reliability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.
- **Allowed form:** Map \<Exception> to a status: \<Class>.\<method> can throw it (through \<Service>.\<method>), and no @ExceptionHandler, @ResponseStatus or ResponseStatusException maps it, so the client gets a 500. Add an @ExceptionHandler for it (or a base class) in a @RestControllerAdvice, or annotate it with @ResponseStatus. An exception fits a class that only signals a server fault.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-unmapped-exception","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/spring-architecture-rules.md)

<a id="dependencies-unused-declared-dependency"></a>

### `dependencies/unused-declared-dependency`

A dependency declared for the main sources that no main class uses.

- **Labels:** simplification
- **Why it is on:** A dependency nothing uses widens the class path and the attack surface, and the build still resolves it on every run.
- **Allowed form:** Remove it, or declare it where it is used: testImplementation, runtimeOnly or compileOnly (Maven: test, runtime or provided scope).
- **Exception:** If this is intended, add `{"rule":"dependencies/unused-declared-dependency","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="effects-accumulatorcopyinloop"></a>

### `effects/AccumulatorCopyInLoop`

A loop that reassigns a local from a copy of itself (`all = Stream.concat(all.stream(), Stream.of(x)).toList()`, `byId = new HashMap<>(byId)`, `List.copyOf`, `Arrays.copyOf`, Guava `copyOf`, `newArrayList`, `ImmutableList.builder().addAll(acc)`), on every iteration (a copy behind an `if` in the loop, such as amortized growth `if (size == values.length) values = Arrays.copyOf(values, size * 2)`, is not reported), and a `Stream.reduce` accumulator that returns such a copy of its accumulator ([#440](https://github.com/jhonDoe15/nitpicker/issues/440)).

- **Labels:** performance
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Build the result once with `collect(Collectors.toList())`, `toMap`, `groupingBy`, `flatMap`, or one mutable collection filled in the loop: in `<method>()` each loop step copies `<variable>` into a new collection, so the work grows with the square of the list.
- **Exception:** If this is intended, add `{"rule":"effects/AccumulatorCopyInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-asyncmethoddoesblockingwork"></a>

### `effects/AsyncMethodDoesBlockingWork`

A method that returns a `Future`, `ListenableFuture`, `CompletableFuture`, `CompletionStage` or Kotlin `Deferred` and returns `Futures.immediateFuture(x)`, `CompletableFuture.completedFuture(x)`, `completedStage(x)` or `CompletableDeferred(x)` where `x` (or the local it was assigned from) comes from a `database` or `remote` call made on the calling thread, directly or through project helpers; methods annotated `@Async` (on the method, the class, the interface method, or through a meta-annotation), and values that are constants, parameters or fields, are not reported ([#796](https://github.com/jhonDoe15/nitpicker/issues/796)).

- **Labels:** performance, async
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Submit the work to an executor (`executor.submit`, `supplyAsync(..., executor)`), use the client's real async API, or make the method synchronous: `<method>()` calls `<repository>.findBy()` on the calling thread and only wraps the result with `CompletableFuture.completedFuture()`, so a caller on an event-loop or single-thread executor waits on it.
- **Exception:** If this is intended, add `{"rule":"effects/AsyncMethodDoesBlockingWork","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-checkthenwritewithoutlock"></a>

### `effects/CheckThenWriteWithoutLock`

In a public method of a Spring bean, a Spring Data repository read (`find*`, `get*`, `exists*`, `count*`) whose result decides, through a branch, a later write (`save*`, `delete*`, `insert*`, `update*`) on the same repository, or the lambda of `orElseGet` on the read: `if (users.existsByEmail(e)) throw ...; users.save(...)`, a count against a limit, `findByEmail(e).orElseGet(() -> users.save(...))`, a status check on the found entity before it is saved; the method may or may not be `@Transactional`, because a default isolation level does not stop two callers from passing the same check ([#791](https://github.com/jhonDoe15/nitpicker/issues/791)).

- **Labels:** bug, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Make the check and the write one atomic step: read with `@Lock(LockModeType.PESSIMISTIC_WRITE)` inside a transaction, add a `@Version` column to the entity, use an upsert, or back the check with a unique constraint: `<method>()` reads with `<repository>.existsBy...()` and then decides a write with `<repository>.save()`, so two concurrent callers can both pass the check.
- **Exception:** If this is intended, add `{"rule":"effects/CheckThenWriteWithoutLock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-deletediteminmemory"></a>

### `effects/DeletedItemInMemory`

A loop, `forEach` or `Stream` step over the items of an entity with a soft-delete or visibility flag (`deletedAt`, `deleted`, `archived`, `hidden`, `visibility` and similar) that never reads the flag, taken from a to-many relationship getter of an `@Entity` (`basket.getItems()`) or from a repository method that does not mention the flag (`findAll`, `findByBasketId`), when at least 5 places iterate that entity and at least 80% of them check the flag (a `getDeletedAt()` or `isDeleted()` call, a field read, a method reference, or a repository method that filters) ([#1220](https://github.com/jhonDoe15/nitpicker/issues/1220)).

- **Labels:** bug
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** This loop or lookup over `<Entity>` items takes them from `<collection>` and does not check `deletedAt`, so deleted items are included. 9 of the 10 places that iterate `<Entity>` skip the deleted ones: filter here the same way (`item.deletedAt`), load the collection with the filter (a repository method or `@SQLRestriction`), or, for a view that wants the deleted items, add it to `exceptions`.
- **Exception:** If this is intended, add `{"rule":"effects/DeletedItemInMemory","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-dualwritewithoutoutbox"></a>

### `effects/DualWriteWithoutOutbox`

A method with a database write (`save`, `persist`, `merge`, `delete`, `insert`, `update`, `executeUpdate` and similar on a `database` client) and a different `message` call site, each direct or through helpers; `ApplicationEventPublisher.publishEvent` counts as a call to the project's `@EventListener` and `@TransactionalEventListener` methods for that event type, and a publish from a `@TransactionalEventListener` (after commit by default) or from `TransactionSynchronization.afterCommit` is reported with an after-commit message ([#322](https://github.com/jhonDoe15/nitpicker/issues/322)).

- **Labels:** reliability, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Write the message to an outbox table in the same transaction and let a relay publish it (or use change data capture or a database-backed queue): `<method>()` writes with `<repository>.save()` and publishes through `<helper>`, which calls `<call>`, so a rollback after the publish announces a change that never happened, and a crash after the commit loses the message.
- **Exception:** If this is intended, add `{"rule":"effects/DualWriteWithoutOutbox","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-entityloadedforexistence"></a>

### `effects/EntityLoadedForExistence`

A `count`/`countBy...` repository call whose only use is an existence test (`> 0`, `>= 1`, `!= 0`, `== 0`, `< 1`, `<= 0`; `> 1` and `== 1` are not), and a finder returning one `@Entity` or an `Optional` of one (a projection or scalar result is not reported) whose only use is `isPresent()`, `isEmpty()`, `== null` or `!= null`; a result used anywhere else, and the list form (`findAllBy(...).isEmpty()`, reported by `SpringDataFilterInQuery`), are not reported ([#838](https://github.com/jhonDoe15/nitpicker/issues/838)).

- **Labels:** performance, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Ask the database with `existsBy...` (or an `exists` query) instead, which stops at the first row: `<method>()` counts the matching rows with `<repository>.countBy()` only to compare the count with zero.
- **Exception:** If this is intended, add `{"rule":"effects/EntityLoadedForExistence","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-entityloadedforonecolumn"></a>

### `effects/EntityLoadedForOneColumn`

A repository finder result of an `@Entity` whose only use is to read one persistent property of each row: `repository.findByTeam(id).stream().map(User::getEmail)` or `.map(u -> u.getEmail())`, a loop that adds one getter to a list (a loop that also adds the element itself is not reported), and in Kotlin `map { it.email }`; the property must be a stored column (a field of the entity or its superclasses that is not `@Transient`, `transient`, `static` or a relationship), so computed getters are not reported ([#838](https://github.com/jhonDoe15/nitpicker/issues/838)).

- **Labels:** performance, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Select only the column with a projection (`@Query("select e.email from <Entity> e where ...")`, an interface or record projection): `<method>()` loads whole `<Entity>` entities with `<repository>.findBy()` only to read `getEmail()` from each, with their eager relations.
- **Exception:** If this is intended, add `{"rule":"effects/EntityLoadedForOneColumn","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-graphqlfieldperparent"></a>

### `effects/GraphqlFieldPerParent`

A Spring for GraphQL `@SchemaMapping` method or a Netflix DGS `@DgsData` method whose parent type is not a root type (`Query`, `Mutation`, `Subscription`) and that calls a `database` or `remote` client, directly or through project helpers: the resolver runs once per parent object, so a list of N parents costs N queries. The schema is read from the module's resources (`.graphqls`, `.graphql` or `.gqls`): only parent types the schema returns as a list (`[Book]`, or the `node` of a connection edge), and the types reachable from them through fields, are reported, and a project without a schema file (code-first) is not reported; the parent is the first parameter that is not an `@Argument`, `@Arguments`, `@ContextValue` or `@LocalContextValue` parameter or a framework type (`Authentication`, `Principal`, `DataFetchingEnvironment`, `GraphQLContext`, `Locale`) ([#799](https://github.com/jhonDoe15/nitpicker/issues/799)).

- **Labels:** performance, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Batch this field with `@BatchMapping` (one call for all parents) or a registered `DataLoader`, or read the value from the parent object: `<method>()` calls `<helper>`, which calls `<call>` once per parent object, so a list of N parents sends N queries, and nothing in the code looks like a loop.
- **Exception:** If this is intended, add `{"rule":"effects/GraphqlFieldPerParent","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-handlerwithoutauth"></a>

### `effects/HandlerWithoutAuth`

A Spring route handler (a `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping` or `@RequestMapping` method of a `@RestController` or `@Controller`) with no authorization requirement, when the project has at least 10 handlers and at least 90% of them declare one: `@PreAuthorize`, `@PostAuthorize`, `@Secured`, `@RolesAllowed`, `@PermitAll` or `@DenyAll` on the method or on the controller class, an annotation of your own that carries one of those (`@AdminOnly`), or a public mark by name (`@Public`, `@Anonymous`, `@AllowAnonymous`, `@Unauthenticated`, `@NoAuth`) ([#758](https://github.com/jhonDoe15/nitpicker/issues/758)).

- **Labels:** security
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** This route handler declares no authorization, while 9 of the 10 handlers of the project do (usually `@PreAuthorize`), so it is open to every caller. Add the same requirement to the handler or its controller class, or mark it public the way the project marks its public routes; a handler that a `SecurityFilterChain` opens on purpose (login, health) goes in `exceptions` for `effects/HandlerWithoutAuth`.
- **Exception:** If this is intended, add `{"rule":"effects/HandlerWithoutAuth","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-iocallinloop"></a>

### `effects/IoCallInLoop`

A call whose kind is `database` or `remote`, on a client or through a project helper, once per loop item: in a `for`, `while` or `do` body, in an iterating callback (`forEach`, `map`, `filter`, `flatMap`, `peek`, `reduce`, `sorted`, `min`, `max`, `collect` and the other `Stream` steps, `Iterable.forEach`, `Iterator.forEachRemaining`, `Map.forEach`, `removeIf`, `replaceAll`, `Collectors.toMap`/`groupingBy` and the other collectors that take a function, `Comparator.comparing`, `Arrays.setAll`/`sort`, Kotlin sequence steps and `compareBy`), also as a method reference (`ids.forEach(loader::load)`); a `database` call also inside a concurrent per-item form (`parallelStream()`, `parallel()`, `CompletableFuture.supplyAsync`/`runAsync` joined in the method, an executor `submit`/`execute`/`invokeAll`/`invokeAny`, `StructuredTaskScope.fork`, Kotlin `async`/`launch`, `Flow.flatMapMerge`).

- **Labels:** performance
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAllById`, `WHERE id IN (...)`, or a helper that takes the whole list): `<method>()` calls `<helper>`, which calls `<call>` once per loop item, one query each. Paging, polling and retry loops are fine; a loop the rule misjudges (a cursor kept in an object or array, a page count read first) goes in `exceptions`.
- **Exception:** If this is intended, add `{"rule":"effects/IoCallInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-jobloopwithoutitemisolation"></a>

### `effects/JobLoopWithoutItemIsolation`

In a job entry point, a loop or iterating callback whose body makes a `database` or `remote` call, direct or through project helpers, with no `try`/`catch` around the call inside the loop, so the first item that throws skips every later item until the next run: a `@Scheduled` method, a `@KafkaListener` method with a batch parameter (`List`, `Collection`, `ConsumerRecords`), a `@SqsListener` method, Quartz `Job.execute`, and the non-public methods of the same class that they call; a catch that rethrows, or a `try` around the whole loop, does not isolate an item ([#804](https://github.com/jhonDoe15/nitpicker/issues/804)).

- **Labels:** reliability
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Catch the failure of each item inside the loop and record it, or enqueue one job per item so the queue isolates them: the loop in the `@Scheduled` job `<method>()` makes a query or write for each item (calls `<helper>`, which calls `<call>`) with no `try` around it, so the first item that throws skips every item after it until the next run, and an item that keeps failing blocks all the others. A job that fails on purpose so that the whole run is retried goes in `exceptions`.
- **Exception:** If this is intended, add `{"rule":"effects/JobLoopWithoutItemIsolation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-lazyrelationinloop"></a>

### `effects/LazyRelationInLoop`

A lazy JPA relationship read on each element of a query result, in a loop or an iterating callback, and then used (`invoice.getCustomer().getName()`, `invoice.getLines().size()`): `@OneToMany` and `@ManyToMany` unless `fetch = EAGER`, `@ManyToOne` and `@OneToOne` with `fetch = LAZY`, on a field or getter of an `@Entity` or `@MappedSuperclass`; the list comes from a Spring Data repository query method (`findAll`, `findAllById`, derived and `@Query` methods) or `EntityManager.createQuery(...)`/`createNamedQuery`/`createNativeQuery(...).getResultList()` in the same method, directly or through `stream()`, `filter`, `sorted` and similar steps ([#314](https://github.com/jhonDoe15/nitpicker/issues/314)).

- **Labels:** performance, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Fetch `<Entity>.<relation>` with the query that loads the list: add `@EntityGraph(attributePaths = "<relation>")` to `<query>` or a `JOIN FETCH` of `<relation>` to its query, batch the loads with `@BatchSize` on the relationship or `hibernate.default_batch_fetch_size`, or select a projection that holds the values: `<method>()` reads the lazy `<relation>` of each `<Entity>` that `<query>` returns, one more query per item.
- **Exception:** If this is intended, add `{"rule":"effects/LazyRelationInLoop","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-reactivelookupperelement"></a>

### `effects/ReactiveLookupPerElement`

A `database` or `remote` call, direct or through project helpers, made for each element of an in-memory collection in a Reactor pipeline: `Flux.fromIterable`, `fromStream` or `fromArray` (through `filter` and other `Flux` steps) followed by `map`, `flatMap`, `flatMapSequential` or `concatMap` (not after `buffer` or `window`, which batch the elements; with an explicit concurrency argument only `database` lookups are reported, since the limit bounds the fan-out but still sends one query per element) whose lambda, method reference or helper reaches a repository (also a `ReactiveCrudRepository`), a `WebClient` or another client, or a project service that does ([#1071](https://github.com/jhonDoe15/nitpicker/issues/1071)).

- **Labels:** performance, async
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Fetch all the elements with one call (`findAllById`, `where id in (:ids)`, a batch endpoint), then join the results in memory: `<method>()` calls `<helper>`, which calls `<call>` once per element of an in-memory collection inside a reactive pipeline, so N elements send N queries.
- **Exception:** If this is intended, add `{"rule":"effects/ReactiveLookupPerElement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-remotecallintransaction"></a>

### `effects/RemoteCallInTransaction`

A `remote` call, direct or through project helpers, inside a transaction that also uses the database (a `database` call in the same scope proves a connection is held; a bare annotation is not enough): a `@Transactional` method (Spring or Jakarta, on the method or, for public methods, on the class, unless `propagation` is `NOT_SUPPORTED` or `NEVER`), a `TransactionTemplate`/`TransactionOperations` `execute` or `executeWithoutResult` callback, an Exposed `transaction {}`, or the code between `Connection.setAutoCommit(false)` and `commit()`/`rollback()` ([#317](https://github.com/jhonDoe15/nitpicker/issues/317)).

- **Labels:** reliability, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Make the remote call before the transaction starts or after it commits; when its side effect must match the transaction, write an outbox row in the transaction and send it from a worker: `<method>()` calls `<helper>`, which calls `<call>` inside the `@Transactional` method `<holder>()`, which also uses the database, so a pooled connection stays held for the remote call's latency and the pool runs dry under load.
- **Exception:** If this is intended, add `{"rule":"effects/RemoteCallInTransaction","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-remotecallunderlock"></a>

### `effects/RemoteCallUnderLock`

A `remote` call, direct or through project helpers, while a lock is held: a `synchronized` method or block, from `Lock.lock()`/`lockInterruptibly()`/`tryLock()` to the last `unlock()` of the same lock (`ReentrantLock`, read/write locks, Redisson `RLock`, Kotlin `withLock`), a kotlinx `Mutex`, or a `Semaphore` created with one permit; an early `return` inside the block does not end the scope, and a `Semaphore` with more permits is a concurrency bound, not a lock ([#317](https://github.com/jhonDoe15/nitpicker/issues/317)).

- **Labels:** reliability, async
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Make the remote call before taking the lock or after releasing it, and keep only the change of the shared state inside; copy the value you need out of the lock first: `<method>()` calls `<helper>`, which calls `<call>` while holding the `synchronized` method `<holder>()`, so every thread waiting for the lock also waits for the remote call's latency. A fill-once block stays allowed: the call under an `if` that tests the state the block then sets (a token refresh, a cached download), so callers wait for one request instead of each sending their own. When the remote effect must happen exactly once per state change, record it in an outbox row and send it from a worker.
- **Exception:** If this is intended, add `{"rule":"effects/RemoteCallUnderLock","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-retrywithoutidempotency"></a>

### `effects/RetryWithoutIdempotency`

A write that is not idempotent, direct or through project helpers, inside a retry scope: a Stripe `create` without `RequestOptions` carrying `setIdempotencyKey`, a `message` publish without a deduplication id (SQS and SNS FIFO `messageDeduplicationId` pass; Kafka, AMQP, JMS, Pub/Sub and NATS do not), or constant SQL text starting with `INSERT` without `ON CONFLICT`, `ON DUPLICATE KEY`, `INSERT IGNORE` or `INSERT OR IGNORE/REPLACE` sent through a database call; retry scopes are `@Retryable` (Spring Retry, Spring Framework 7) and resilience4j `@Retry` methods, lambdas passed to resilience4j `Retry.decorate*`/`execute*`, `RetryTemplate.execute` and Failsafe executors whose policies include a `RetryPolicy` (a circuit breaker alone does not retry), and the attempts of a hand-written retry loop ([#318](https://github.com/jhonDoe15/nitpicker/issues/318)).

- **Labels:** reliability
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Make the insert an upsert keyed on a stable id (`ON CONFLICT`, `ON DUPLICATE KEY UPDATE`, `MERGE`), or retry only the read: `<method>()` calls `<helper>`, which calls `<call>` inside the `@Retryable` method `<holder>()`, and when a call times out after the other side accepted the write, the retry makes it again.
- **Exception:** If this is intended, add `{"rule":"effects/RetryWithoutIdempotency","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-retrywithstaleobject"></a>

### `effects/RetryWithStaleObject`

An optimistic-lock retry that resends an object read or built outside the retried scope, in Java and Kotlin: a Reactor `retry`/`retryWhen` (whose `Retry` specification or its filter names `OptimisticLockingFailureException`, `OptimisticLockException` or a Hibernate stale-state exception; the rest of the method is not read) on a chain whose `save`, `update`, `create`, `insert` or other repository write takes a method parameter, a local assigned before the chain or a variable captured by a `Mono.defer` lambda; a `for`/`while` loop with a `catch` of the conflict whose body saves an object loaded before the loop and does not `refresh` it (`entityManager.refresh(object)` counts as a re-read); and a `@Retryable` method that lists the conflict and saves its own entity parameter ([#739](https://github.com/jhonDoe15/nitpicker/issues/739)).

- **Labels:** bug, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Re-read the row by id and re-apply the change inside the retried scope (`Mono.defer { findById(id).map(change).flatMap(save) }`, a loop that loads the row on each attempt, or a `@Retryable` method that takes the id): `<method>()` retries after an optimistic-lock conflict (retry loop) but sends an object that was read or built outside the retry, then calls `<repository>.save()` with `order`, which keeps the old version, so every attempt fails the same way.
- **Exception:** If this is intended, add `{"rule":"effects/RetryWithStaleObject","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-rowschangedinmemory"></a>

### `effects/RowsChangedInMemory`

Rows loaded by a Spring Data finder (`findBy...`, `findAll`) of an `@Entity` that are used only to be changed or deleted, in Java and Kotlin: a loop or `forEach` whose body only calls setters with values that do not depend on the element (constants, parameters, locals), followed by `saveAll(rows)` or by the end of a `@Transactional` method (dirty checking), or `deleteAll(rows)`/`deleteAllInBatch(rows)`, or a loop of `repository.delete(element)`. Not reported: values from the element, bodies that call anything else, rows used elsewhere, and entities a bulk statement would skip (`@Version`, `@PreUpdate`, `@PostUpdate`, `@PreRemove`, `@PostRemove`, `@EntityListeners`, `@LastModifiedDate`, `@LastModifiedBy`, `@DomainEvents`, `AbstractAggregateRoot`, Envers `@Audited`, any `cascade`, and for deletes Hibernate `@SQLDelete`/`@SoftDelete` and collection tables: `@ElementCollection`, `@ManyToMany`, `@JoinTable`, `@CollectionTable`), and values that change inside the loop (a counter, `position++`, any local assigned in the loop) ([#836](https://github.com/jhonDoe15/nitpicker/issues/836)).

- **Labels:** performance, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Change the rows with one statement (`@Modifying @Query("update <Entity> e set e.status = :to where ...")`) instead of loading them: `<method>()` loads `<Entity>` rows with `<repository>.findBy()` only to set the same value on each and write them back. An entity with `@Version`, `@PreUpdate`/`@PreRemove`, `@EntityListeners`, auditing, domain events or cascades is not reported, because a bulk statement skips what these run.
- **Exception:** If this is intended, add `{"rule":"effects/RowsChangedInMemory","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-softdeletefiltermissing"></a>

### `effects/SoftDeleteFilterMissing`

A read of an entity that has a soft-delete or visibility flag (`deleted`, `deletedAt`, `isDeleted`, `archived`, `hidden`, `visible`, `visibility` and similar boolean, timestamp or enum properties) that leaves the flag out, where at least 5 reads of that entity exist and at least 80% of them filter on it: a Spring Data repository method, derived (`findByOwner`) or `@Query`, reported at each call site, and a `createQuery`, `createNativeQuery` or `JdbcTemplate` read with constant SQL or JPQL text, reported at the call; an entity with `@SQLRestriction`, `@Where`, `@FilterDef` or `@SoftDelete` is left alone, as are built-in `findById` and `findAll` ([#754](https://github.com/jhonDoe15/nitpicker/issues/754)).

- **Labels:** bug, persistence
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Filter out deleted rows with the predicate the other reads of `<Entity>` apply: `<query>` reads `<Entity>` without a condition on `deletedAt`, which 9 of the 10 reads of it check, so a deleted row shows up here. Add the condition to the query (or `@SQLRestriction` on the entity, so every read applies it); a trash, restore or purge read that wants the deleted rows goes in `exceptions`.
- **Exception:** If this is intended, add `{"rule":"effects/SoftDeleteFilterMissing","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="effects-waitonasynctwin"></a>

### `effects/WaitOnAsyncTwin`

`.get()`, `.get(timeout, unit)`, `.join()`, `Futures.getUnchecked`, `Futures.getDone` or `Uninterruptibles.getUninterruptibly` applied directly to the result of a call to `fooAsync(args)` when the same type declares `foo` with the same parameter types (timed waits, `get(timeout, unit)` and `orTimeout` chains, are not reported: the synchronous twin cannot time out) ([#796](https://github.com/jhonDoe15/nitpicker/issues/796)).

- **Labels:** bug, async
- **Why it is on:** The effects engine reads the compiled classes with ASM and follows the project helpers a call goes through, so it reports what a source pattern cannot see; the Java and Kotlin presets share it on Gradle and Maven.
- **Allowed form:** Call the synchronous `findById()` instead: `<method>()` waits on `<Dao>.findByIdAsync()`, which takes an executor thread, blocks the caller anyway and turns every failure into an `ExecutionException`.
- **Exception:** If this is intended, add `{"rule":"effects/WaitOnAsyncTwin","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/effects-rules.md), [Kotlin preset guide](../kotlin-preset/effects-rules.md)

<a id="errorprone-inlinesuppression"></a>

### `errorprone/InlineSuppression`

An inline suppression of errorprone in a Java source.

- **Labels:** maintainability
- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence Error Prone or NullAway inline: fix the finding (for NullAway, annotate what may be null with @Nullable).
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="forbiddenapis-clock-now"></a>

### `forbiddenapis/clock-now`

A `now()` call of a `java.time` class that takes no `Clock`.

- **Labels:** maintainability
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Inject a java.time.Clock and call now(clock), so the code can be tested with a fixed time.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/clock-now","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-java-deserialization"></a>

### `forbiddenapis/java-deserialization`

A `new ObjectInputStream`, which reads Java-serialized objects.

- **Labels:** security
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not read Java-serialized objects. Use JSON or another data format.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/java-deserialization","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-legacy-date-time"></a>

### `forbiddenapis/legacy-date-time`

A call of the legacy date classes: `Date`, `Calendar`, `TimeZone` or `SimpleDateFormat`.

- **Labels:** maintainability
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Use java.time (Instant, LocalDate, ZonedDateTime, ZoneId and DateTimeFormatter) instead of the legacy date classes. Convert a Date another API returns with toInstant() in the same expression.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/legacy-date-time","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-new-thread"></a>

### `forbiddenapis/new-thread`

A `Thread.start` call, which starts a thread by hand.

- **Labels:** maintainability, async
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not start threads by hand. Submit the work to an injected ExecutorService (a ThreadFactory or a shutdown hook may still create the Thread).
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/new-thread","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-runtime-exec"></a>

### `forbiddenapis/runtime-exec`

A `Runtime.exec` call that runs a command string.

- **Labels:** security
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Run commands with ProcessBuilder and an argument list, never a command string.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/runtime-exec","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="forbiddenapis-thread-sleep"></a>

### `forbiddenapis/thread-sleep`

A `Thread.sleep` or `TimeUnit.sleep` call in main code.

- **Labels:** bug
- **Why it is on:** The forbidden-apis check reads the compiled main classes against nitpicker's own signature list: each signature is an API with a safer or more testable replacement, and the check reports every use.
- **Allowed form:** Do not sleep in production code. Schedule the work (ScheduledExecutorService) or wait on the condition.
- **Exception:** If this is intended, add `{"rule":"forbiddenapis/thread-sleep","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="google-java-format-format"></a>

### `google-java-format/format`

A Java file is not formatted with google-java-format.

- **Labels:** style
- **Why it is on:** The Java presets keep one layout, the formatter's. google-java-format runs in check mode and reports every file it would change.
- **Allowed form:** File is not formatted with google-java-format. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir", "spring" or "none" in nitpicker.config.json.
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"google-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/style.md)

<a id="javac-cast"></a>

### `javac/cast`

A cast to the type the expression already has.

- **Labels:** simplification
- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Remove the cast.
- **Exception:** If this is intended, add `{"rule":"javac/cast","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-deprecation"></a>

### `javac/deprecation`

A call of an API marked `@Deprecated`.

- **Labels:** maintainability
- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Call the replacement named in the API's Javadoc.
- **Exception:** If this is intended, add `{"rule":"javac/deprecation","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-rawtypes"></a>

### `javac/rawtypes`

A generic type used without its type arguments.

- **Labels:** bug
- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Add the type arguments, as in List\<String>.
- **Exception:** If this is intended, add `{"rule":"javac/rawtypes","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-removal"></a>

### `javac/removal`

A call of an API marked `@Deprecated(forRemoval = true)`.

- **Labels:** bug
- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Call the replacement named in the API's Javadoc; this API is going to be removed.
- **Exception:** If this is intended, add `{"rule":"javac/removal","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="javac-unchecked"></a>

### `javac/unchecked`

An operation javac cannot check at compile time, such as an unchecked cast.

- **Labels:** bug
- **Why it is on:** A javac lint compile of the main sources reports these warnings, and a warning a change adds fails the gate; the lint is not hidden by `@SuppressWarnings`.
- **Allowed form:** Use a typed API, a checked conversion or a generic method instead of the unchecked operation.
- **Exception:** If this is intended, add `{"rule":"javac/unchecked","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guards](../java-preset/guards.md)

<a id="palantir-java-format-format"></a>

### `palantir-java-format/format`

A Java file is not formatted with palantir-java-format.

- **Labels:** style
- **Why it is on:** The Java presets keep one layout, the formatter's. palantir-java-format runs in check mode and reports every file it would change.
- **Allowed form:** File is not formatted with palantir-java-format. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand. Not your formatter: pin "conventions.java.formatter" to "google", "palantir", "spring" or "none" in nitpicker.config.json.
- **Fix:** Automatic: `nitpicker --fix` removes the finding.
- **Exception:** If this is intended, add `{"rule":"palantir-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/style.md)

<a id="pmd-commentedoutcode"></a>

### `pmd/CommentedOutCode`

A comment in a Java source whose lines read as Java statements or declarations.

- **Labels:** simplification
- **Why it is on:** Commented-out code goes stale and hides what is live; version control keeps the old version.
- **Allowed form:** Delete the commented-out code; version control keeps it.
- **Exception:** If this is intended, add `{"rule":"pmd/CommentedOutCode","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-copiedconstantintest"></a>

### `pmd/CopiedConstantInTest`

A string or number literal in a test that equals an `UPPER_SNAKE` constant of a main-source class, object or file the test can see.

- **Labels:** tests, maintainability
- **Why it is on:** When the constant changes, a test that holds a copy of its value keeps checking the old value, or a boundary test stops testing the boundary. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.
- **Allowed form:** This literal copies \<Owner>.\<NAME> from \<file>: when \<Owner>.\<NAME> changes, the test keeps checking the old value or stops testing the case it was written for. Use \<Owner>.\<NAME> (or an expression on it, such as \<Owner>.\<NAME> + 1). If the value is a contract the test pins on purpose, assert it next to the constant: assertEquals(\<value>, \<Owner>.\<NAME>).
- **Exception:** If this is intended, add `{"rule":"pmd/CopiedConstantInTest","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/tests-that-copy-a-constant.md), [TypeScript and JavaScript counterpart `nitpicker/no-copied-constant`](typescript-nitpicker.md#eslint-nitpicker-no-copied-constant), [Python counterpart `copied-constant-in-test`](python-nitpicker.md#python-rules-copied-constant-in-test), [Go counterpart `go-rules/copied-constant-in-test`](../go-preset.md#own-rules)

<a id="pmd-inlinesuppression"></a>

### `pmd/InlineSuppression`

An inline suppression of pmd in a Java source.

- **Labels:** maintainability
- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence PMD inline: fix the finding. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.
- **Exception:** If this is intended, add `{"rule":"pmd/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-maxvalueoverflow"></a>

### `pmd/MaxValueOverflow`

An integer `+`, `*` or `+=` with an operand that can hold `Integer.MAX_VALUE` or `Long.MAX_VALUE` (a constant, field or local initialised to it, a parameter a call passes it or defaults to it), whose result is an index, length, bound, `Math.min` argument or compared.

- **Labels:** bug
- **Why it is on:** A "no limit" value overflows as soon as it is added to something, and the negative result goes on as an index or bound. Nitpicker reads the sources of every module for it and prints it as a PMD rule, like the other cross-file rules.
- **Allowed form:** `<width>` can hold Integer.MAX_VALUE (a "no limit" value), so `<start> + <width>` overflows to a negative number that is then used as an index, length, bound or comparison. Compare without adding (`width >= length - start`), widen first (`(long) start + width`), use `Math.addExact`, or check the sentinel before the arithmetic (`if (<width> == Integer.MAX_VALUE) ...`).
- **Exception:** If this is intended, add `{"rule":"pmd/MaxValueOverflow","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/sums-that-overflow-a-maximum-value.md), [Go counterpart `go-rules/max-value-overflow`](../go-preset.md#own-rules)

<a id="pmd-todowithoutissue"></a>

### `pmd/TodoWithoutIssue`

A `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` comment in a Java source with no issue reference.

- **Labels:** maintainability
- **Why it is on:** A task marker without an issue is never picked up, so it stays in the code for good.
- **Allowed form:** A TODO or FIXME needs an issue reference: write `TODO(#123): ...` or `TODO PROJ-123: ...`, or do the work now.
- **Exception:** If this is intended, add `{"rule":"pmd/TodoWithoutIssue","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="pmd-untestedroundtrip"></a>

### `pmd/UntestedRoundTrip`

Two public methods of one main-source class or file that turn values into each other (`toJson`/`fromJson`, `encode`/`decode`), with no test that calls both.

- **Labels:** tests
- **Why it is on:** A field that one half drops or garbles passes every test that checks each half alone. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.
- **Allowed form:** \<Owner>.\<encode> and \<Owner>.\<decode> turn values into each other, and no test runs one on the output of the other, so a field that one of them drops or garbles goes unnoticed. Add a test that calls both on the same value: assertEquals(value, \<Owner>.\<decode>(\<Owner>.\<encode>(value))), with values that need escaping or mapping (quotes, newlines, non-ASCII, empty and absent fields).
- **Exception:** If this is intended, add `{"rule":"pmd/UntestedRoundTrip","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset/round-trip-tests.md)

<a id="spotbugs-inlinesuppression"></a>

### `spotbugs/InlineSuppression`

An inline suppression of spotbugs in a Java source.

- **Labels:** maintainability
- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence SpotBugs inline: fix the bug.
- **Exception:** If this is intended, add `{"rule":"spotbugs/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spring-active-profile"></a>

### `spring/active-profile`

`spring.profiles.active` or `spring.profiles.include` with a literal value in the main (profile-less) document, one finding per line.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/active-profile`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/active-profile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.profiles.active`: Set SPRING_PROFILES_ACTIVE in each deployment instead, or spring.profiles.default for a fallback that a deployment can override. spring.profiles.active in the packaged main file turns those profiles on in every environment.
  - `spring.profiles.include`: Name them in a spring.profiles.group entry instead, and activate that group with SPRING_PROFILES_ACTIVE in each deployment. spring.profiles.include in the packaged main file turns those profiles on in every environment.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-actuator-exposure"></a>

### `spring/actuator-exposure`

`management.endpoints.web.exposure.include` containing `*` or a sensitive endpoint (below); `management.endpoints.access.default=unrestricted`; `management.endpoint.shutdown.access=unrestricted`; `management.endpoint.heapdump.access` `read-only` or `unrestricted`; `management.endpoint.shutdown.enabled` or `management.endpoints.enabled-by-default` true.

- **Labels:** security, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/actuator-exposure`: `--fix` alone skips the rewrite, because it needs a review.
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

- **Labels:** reliability, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Exception:** If this is intended, add `{"rule":"spring/datasource-without-timeout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.datasource.url`: Set a deadline for database queries, such as spring.jpa.properties.jakarta.persistence.query.timeout=30000 or socketTimeout in the JDBC URL; without one a stuck query holds its request and pool connection for good.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-ddl-auto"></a>

### `spring/ddl-auto`

`spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` other than `none`/`validate`, or `spring.jpa.generate-ddl` true.

- **Labels:** reliability, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/ddl-auto`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/ddl-auto","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.hibernate.ddl-auto`: Manage the schema with Flyway or Liquibase and set spring.jpa.hibernate.ddl-auto to none or validate; other modes let Hibernate change the schema.
  - `spring.jpa.generate-ddl`: Manage the schema with Flyway or Liquibase and keep spring.jpa.generate-ddl false; true lets Hibernate change the schema.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-error-details"></a>

### `spring/error-details`

`server.error.include-stacktrace`, `include-message` or `include-binding-errors` set to `always` or `on-param`; `include-exception` true; also as a placeholder default (`${X:always}`).

- **Labels:** security, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/error-details`: `--fix` alone skips the rewrite, because it needs a review.
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

- **Labels:** security, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/literal-secret`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/literal-secret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.datasource.password`: Set SPRING_DATASOURCE_PASSWORD in the environment, or read it from a secret store, and remove the literal secret from spring.datasource.password.
  - `spring.datasource.url`: Supply the credential in spring.datasource.url from the environment, for example through a placeholder without a default, and take it out of the URL.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-missing-enable"></a>

### `spring/missing-enable`

`@Scheduled`, `@Async`, the cache annotations, `@PreAuthorize` and friends, or `@Retryable` used in Java or Kotlin while no main class has the matching `@Enable...` and no XML `annotation-driven` element enables it.

- **Labels:** bug, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** An annotation such as `@Scheduled` or `@Async` does nothing until the matching `@Enable...` is present, and Spring raises no error when it is missing.
- **Fix:** With `nitpicker --fix --rule spring/missing-enable`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/missing-enable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `enable-scheduling`: Add @EnableScheduling to one @Configuration class; without it @Scheduled does nothing.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-open-in-view"></a>

### `spring/open-in-view`

JPA in the main sources (`jakarta.persistence` or `javax.persistence` import) and `spring.jpa.open-in-view` unset, or true.

- **Labels:** performance, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/open-in-view`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/open-in-view","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.open-in-view`: Set spring.jpa.open-in-view=false. Spring Boot enables open-in-view by default, which holds a database connection through view rendering and hides N+1 queries.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-risky-startup-flags"></a>

### `spring/risky-startup-flags`

`spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` true.

- **Labels:** maintainability, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/risky-startup-flags`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/risky-startup-flags","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.main.allow-circular-references`: Remove spring.main.allow-circular-references=true and restructure the beans; the flag hides wiring problems instead of fixing them.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-unbound-property"></a>

### `spring/unbound-property`

A key in an `application*` file (main or test resources) or a test override (`@SpringBootTest` and slice `properties`, `@TestPropertySource(properties)`, `TestPropertyValues`, `withPropertyValues`, `DynamicPropertyRegistry.add`) that binds to no known property, under a group that is described; see below.

- **Labels:** bug, spring
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

- **Labels:** security, spring, persistence
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Fix:** With `nitpicker --fix --rule spring/unsafe-diagnostics`: `--fix` alone skips the rewrite, because it needs a review.
- **Exception:** If this is intended, add `{"rule":"spring/unsafe-diagnostics","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `spring.jpa.show-sql`: Log SQL with the logging.level.org.hibernate.SQL logger in a local profile and remove spring.jpa.show-sql=true, which prints SQL to standard output, outside logging.
  - `logging.level.org.hibernate.orm.jdbc.bind`: Leave logging.level.org.hibernate.orm.jdbc.bind at its default level; trace logs bound SQL values, including passwords and personal data.
  - `spring.h2.console.enabled`: Enable spring.h2.console.enabled only in a local profile; it opens the H2 web console.
  - `management.endpoint.env.show-values`: Set management.endpoint.env.show-values to when-authorized or never; always serves internals to every caller.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="spring-untrimmed-request-text"></a>

### `spring/untrimmed-request-text`

A `@RequestParam String`, or a field of a form object or `@RequestBody` (`owner.getLastName()`), given untrimmed to a finder named `...StartingWith`, `Containing`, `Like`, `IgnoreCase` or `Equals` or a plain `findBy<Field>` (not an id, uuid, token, code, status or type field), a `setParameter`, `like`, `equal` or `addValue` call, or a `JdbcTemplate` query, directly or through a method of the same class; quiet when the handler trims it or a `StringTrimmerEditor` is registered in an `@InitBinder` of a `@ControllerAdvice` (one global trimmer; a controller's own `@InitBinder` clears only that controller); `@PathVariable` is not read.

- **Labels:** bug, spring
- **Scope:** A project with Spring on the compile classpath.
- **Why it is on:** A padded search text finds nothing; trim request text once.
- **Exception:** If this is intended, add `{"rule":"spring/untrimmed-request-text","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `find.owner`: Trim owner.getLastName() before the lookup: call strip() on it, or register one StringTrimmerEditor in an @InitBinder of a @ControllerAdvice so every handler gets trimmed text.
- **See also:** [Java preset guide](../java-preset/spring-configuration-files.md)

<a id="test-runtime-test-not-run"></a>

### `test-runtime/test-not-run`

A test class that no Test task or Failsafe execution runs.

- **Labels:** tests
- **Why it is on:** A test that never runs cannot fail, so it proves nothing.
- **Exception:** If this is intended, add `{"rule":"test-runtime/test-not-run","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **Allowed forms by message:**
  - `Gradle`: Register a Test task for the \<sourceSet> source set (testClassesDirs = sourceSets.\<sourceSet>.output.classesDirs, classpath = sourceSets.\<sourceSet>.runtimeClasspath) so \<Test> runs: no test task runs that source set, so its tests never run.
  - `Maven`: Bind the integration-test and verify goals of maven-failsafe-plugin in this module so \<Test>IT runs: Surefire skips classes named IT\*, \*IT and \*ITCase, and Failsafe does not run here, so its tests never run.
- **See also:** [Java preset guide](../java-preset/tests-that-never-run.md)
