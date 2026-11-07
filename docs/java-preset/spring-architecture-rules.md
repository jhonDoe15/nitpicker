# Spring architecture rules

Part of the [Java preset guide](../java-preset.md).

Spring projects (same detection as the Spring ruleset: `spring-context` or `spring-boot` on the
compile classpath, `spring: true` in the manifest) also get nitpicker's own ArchUnit rules, and so
does a module with `jmolecules-ddd` on its main compile classpath (for the aggregate rules below). They are
separate from the project's own `*ArchTest` classes of slice 4 and need nothing from the project:
the init script's `nitpickerSpringArch` task resolves ArchUnit 1.5.1 (Apache-2.0, pinned in the
`pinned` map) into its own configuration, compiles the rule classes in
[`languages/java/gradle/archunit/`](../../languages/java/gradle/archunit/) with the JDK that runs Gradle
and runs them once, in one separate JVM, over the compiled main and test classes. That is one extra
JVM per side (base and head), a few seconds. The compiled rule classes are cached in the Gradle
user home (`caches/nitpicker/spring-arch/<hash>`, keyed by the rule sources, the ArchUnit version
and the JDK), so `javac` runs only the first time. The report is `build/nitpicker/spring-arch.json`
(format in [internals.md](../internals.md)); the manifest then says `springArch: true`, and a
manifest that says so without the report is a tool error. Maven builds run these rules too (see
[Maven builds](maven-builds.md)) and write the report to `target/nitpicker/spring-arch.json`.

Findings print as `archunit/<rule>`, one per rule, offending class and dependency, on the class's
source file (a nested class counts as its outermost class). The identity is the simple class name
plus the simple name of the dependency or method involved, never a package or a line: a second bad
dependency in an already violating class is new, while moving code, or moving the file to another
package (the move `spring-layout` asks for, tracked as a rename), keeps its legacy findings matched. Every message leads with the allowed form and ends with the
shared exception sentence: add `{ "rule": "archunit/<rule>", "paths": ["<file>"], "reason": "..." }` to
`exceptions` in `nitpicker.config.json`. Repeats of one identity are numbered `#n` per file, so a
same-named class in another package never shifts them.

**Layout: package by feature, as in the TypeScript preset.** The root package is the package of the
`@SpringBootApplication` class (the common prefix when there are several; without one the layout
rules are skipped and the rest still runs). Its direct sub-packages are features, plus `shared` for
pure utilities. Every root sub-package that is not `shared` and not a layer name counts as a
feature, including technical ones such as `config` or `security`: their sub-packages are internal
to them. Layer names cover the layered and the hexagonal (ports and adapters) layouts, so such an
app gets one `spring-layout` finding per class, naming the feature package to use, and no
`spring-feature-boundary` finding for its normal port edges. The layout mirrors the TypeScript one: `features/<f>/` with an `index.ts` becomes
`<root>.<feature>` whose top-level classes are the feature's public face, and `shared` is the
TypeScript `shared/` folder.

| Rule                      | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-layout`           | a class sits directly in the root package (only `@SpringBootApplication`, `@Configuration` and `@ConfigurationProperties` classes and a `SpringBootServletInitializer` subclass may), or in a root sub-package named by layer: `controller(s)`, `service(s)`, `repository`/`repositories`, `entity`/`entities`, `model(s)`, `dto(s)`, `dao(s)`, `util(s)`, `common`, `web`, `api`, `rest`, `resource(s)`, `persistence`, `domain`, `mapper(s)`, `exception(s)`, `adapter(s)`, `application`, `infrastructure`, `infra`, `port(s)`, `usecase(s)`, `helper(s)` |
| `spring-feature-boundary` | a class uses a class from a sub-package of another root package (`orders.internal.X` from `billing`); the classes directly in the other package are fine                                                                                                                                                                                                                                                                                                                                                                                                     |
| `spring-shared-pure`      | a `shared` class is a Spring bean (`@Component` and its stereotypes, `@Configuration`) or an `@Entity`, or depends on a class in any other root package                                                                                                                                                                                                                                                                                                                                                                                                      |

**Layering.**

| Rule                           | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-controller-repository` | a `@Controller` or `@RestController` depends on a repository (`@Repository`, or a type extending Spring Data's `Repository`) or on data access directly (`JdbcTemplate`, `NamedParameterJdbcTemplate`, `JdbcClient`, `SimpleJdbcInsert`, R2DBC `DatabaseClient`, `JdbcAggregateTemplate`, `R2dbcEntityTemplate`, `MongoTemplate`, `EntityManager`, `EntityManagerFactory`, Hibernate `Session`, `DataSource`, or their interfaces), in a field, parameter, return type or call                                                                                                                                                                                                          |
| `spring-controller-entity`     | a request-mapping or `@ModelAttribute` method of a controller takes or returns an `@Entity` type, also inside a generic such as `List<Customer>`; methods declared on implemented interfaces (the OpenAPI-generator layout) and inherited from base controllers count                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `spring-service-web`           | a `@Service` or repository depends on the web layer: a controller or `@ControllerAdvice`, `ResponseEntity` in its own field, method or constructor signatures (not a `RestTemplate` or `RestClient` result it unwraps), or the `jakarta.servlet`, `javax.servlet`, `org.springframework.web.bind`, `org.springframework.web.servlet`, `org.springframework.web.multipart`, `org.springframework.web.context.request` (`RequestContextHolder`, `WebRequest`), `org.springframework.web.server` (`ServerWebExchange`, `ResponseStatusException`), `org.springframework.web.reactive` or `org.springframework.http.server` packages, so servlet and WebFlux apps are held to the same rule |
| `spring-controller-controller` | a controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`. Naming another controller's class in a link (`methodOn(OrderController.class)`, a `Class<OrderController>`) is fine                                                                                                                                                                                                                                                                                                                                                                                                         |
| `spring-repository-service`    | a repository depends on a `@Service`: a field, parameter, return type or call. A repository depending on a controller or the web layer is `spring-service-web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Roles come from Spring's stereotypes, read through composed annotations (`@RestController`, a
project's own annotation carrying `@Service`). A project whose classes carry other role markers maps
them with the `spring.roles` config key: `{ "spring": { "roles": { "service": ["com.example.UseCase"] } } }`
gives every class annotated with `@UseCase` (directly or through a composed annotation), or extending
or implementing `com.example.UseCase`, the service role on top of its stereotypes. Keys are
`controller`, `service` and `repository`; names are binary class names, so a nested type is
`com.example.Roles$UseCase`. A repository is also any `@RepositoryDefinition` interface. A mapping
only adds roles, so it never lifts a finding; a small application that keeps a controller calling a
repository on purpose uses an exception. When a layering rule and `spring-feature-boundary` both
report the same class and dependency (a controller using `orders.internal.OrderRepository` from
`billing`), only the layering finding is shown, unless an exception lifts it, in which case the
boundary finding is still reported.

**Bean lifetimes.**

| Rule                   | Fails when                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spring-scope-capture` | a singleton bean (a `@Component` class or a `@Bean` method without `@Scope`, or with `singleton` or `application` scope) takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy: in a constructor or `@Bean` method parameter, an `@Autowired`, `@Inject` or `@Resource` field or method, also as `Optional<T>`, an array or a collection or map of them |
| `spring-request-state` | request data reaches a field of a singleton bean or a static field outside set-up: assigned, written into an array element, or passed to a collection, map, `Map.Entry` or `AtomicReference` mutator (`add`, `put`, `computeIfAbsent`, `set`, ...)                                                                                                                                                           |

The scope is read from `@Scope` on the class or `@Bean` method, directly or through a composed
annotation such as `@RequestScope` (whose own `ScopedProxyMode` attribute, `TARGET_CLASS` by
default, wins over the `@Scope` it carries). A scoped proxy (`proxyMode` `TARGET_CLASS` or
`INTERFACES`, or that default set with `@ComponentScan` or `@ComponentScans`), an
`ObjectProvider<T>`, `ObjectFactory<T>` or `Provider<T>`, and a `@Lazy` injection point are fine:
each resolves the bean per use. `@Lazy(false)` is not lazy, and `@Lazy` on a method covers its
parameters only on a constructor or a `void` method, as in Spring (on a `@Bean` method it only
delays the bean). A component is injected through the constructor Spring picks: its only
constructor, or the one marked `@Autowired` or `@Inject`. A finding on a `@Bean` method names the
method: `pricing:request:Basket` in the identity. The injected type is matched against every bean the module
declares; the rule claims only when all of them have such a scope. So a prototype bean (one
instance per injection point, often meant), a custom scope it cannot model (`@Scope("tenant")`,
`thread`), a type with no bean in the module (one from a library or registered in code) or a
`@ComponentScan(scopedProxy = ...)` default it cannot resolve to one mode is never a finding.

`spring-request-state` follows request data through the compiled code (bytecode dataflow with
[ASM](https://asm.ow2.io), BSD-3-Clause, added to the rule runner only). Request data is every
parameter of a handler method (`@RequestMapping` and its shortcuts, `@MessageMapping`,
`@SubscribeMapping`, `@SchemaMapping`, `@BatchMapping`, `@KafkaListener`, `@KafkaHandler`,
`@RabbitListener`, `@RabbitHandler`, `@JmsListener`, `@ModelAttribute`, `@InitBinder`,
`@ExceptionHandler`, also when the annotation sits on the interface or superclass method the handler
overrides, as in a generated `XApi` interface), any parameter annotated `@RequestParam`,
`@PathVariable`, `@RequestBody`, `@RequestHeader`, `@CookieValue`, `@RequestPart`,
`@MatrixVariable`, `@RequestAttribute`, `@SessionAttribute`, `@ModelAttribute`, `@Payload`,
`@Header(s)`, `@DestinationVariable` or `@Argument`, any parameter of a request type
(`ServletRequest`, `WebRequest`, `ServerHttpRequest`, `ServerWebExchange`, a functional
`ServerRequest`) and the result of `RequestContextHolder.getRequestAttributes()` /
`currentRequestAttributes()`, `SecurityContextHolder.getContext()` and
`ReactiveSecurityContextHolder.getContext()`, also through the project's own helpers that return it.
It follows the data through local variables, values derived from it, new objects, collections and
`StringBuilder`s built from it (library calls that fill a local object, `Collections.addAll`,
`System.arraycopy`, method references such as `list::add`), getters and identity helpers
(`Objects.requireNonNull`), calls into the project's own methods (across classes, through interfaces
to every implementation, to the class of an object the method created, and through lambdas and
method references the code runs or passes on), inner and anonymous classes writing their outer
class's fields, and helper objects a singleton holds, and reports the field where it ends up, once
per field, on the class that declares the shared field (a base class of a singleton, another
singleton reached through its getter), with the first handler parameter or source that reaches it:
`last:put:VisitController.create(visit)`, identity `VisitController|last`. Stores are writes to a
field, an array element or a collection, map (also `MultiValueMap`, `HttpHeaders`, `Properties`),
`Map.Entry`, `ListIterator`, `AtomicReference` or `StringBuilder` mutator.

Constructors, static initializers, `@PostConstruct`, `afterPropertiesSet`, `@Bean` methods and
injection methods (`@Autowired`, `@Inject`, `@Resource`) are set-up and never report, and neither
does an injected field (a Kotlin `@Autowired lateinit var` set through its setter). Also fine: a
local collection, a counter that only counts (`AtomicLong.incrementAndGet()`), a cache call
(`Cache.put`, `@Cacheable`), a `ThreadLocal`, a field of a primitive, boxed or enum type (a flag or a
running total), a field whose type only a per-use bean (`@RequestScope`, prototype, also declared
with `@Bean`) can fill, inherited fields included, a field of a request-scoped bean, a new instance
of a bean class that a handler builds and uses locally, and an element a predicate (`filter`,
`anyMatch`, ...) only compared with request data. A Kotlin `suspend` handler's `Continuation`
parameter is not request data, and locals the coroutine state machine saves keep their own data.
Shared classes are the classes `spring-scope-capture` treats as singletons, the types a singleton
`@Bean` method returns and the project classes it constructs (for a project return type also its
subclasses that are not components themselves), classes named in `@Import`, `@WebFilter`,
`@WebServlet` and `@WebListener` classes, enums, Kotlin `object`s, and every superclass of these.
A registry keyed by request data (in-flight keys, per-key locks, pending replies, an unbounded memo
map) is reported: bound it with a cache that has a size and an expiry, or add an exception that
names why its entries are removed. The analysis reads one module's classes: a call into another
module of a multi-module build or into a library is not followed.

**Request bodies.** `pmd/SpringTypedRequestBody` reports a `@RequestBody` parameter that is itself
untyped; this rule follows the parameter into the project's own types, which PMD cannot see from one
file.

| Rule                         | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-typed-request-field` | a project type that a controller binds from the request (a `@RequestBody`, `@RequestPart`, `@ModelAttribute` or `HttpEntity` parameter, or the payload of a `@MessageMapping` or `@SubscribeMapping` method) has a field typed `Object`, `JsonNode` (or a subtype such as `ObjectNode`), a `Map` whose values are `Object` or `?`, a raw `Map` or collection, a project class extending `HashMap<String, Object>`, or a collection, array, `Optional` or map of those, or a `@JsonAnySetter` method or field, also in a nested type |

The walk starts at the project types in the parameter type (also inside `List`, `Optional`, arrays,
`Map`, `HttpEntity`, `Mono` and `Flux`) of the handler methods of controller classes (`@Controller`,
composed annotations such as `@RestController`, and the `controller` role of `spring.roles`),
including those inherited from project superclasses and interfaces, with their type arguments bound
(`class OrderController extends CrudController<OrderDto>` walks `OrderDto`). A message handler's
payload is its `@Payload` parameter or a parameter with no annotation other than nullability and
validation ones; `@Header`, `@AuthenticationPrincipal` or a project's own argument annotation leave
the parameter out. The walk goes through the bound properties (record components, public fields,
fields with a getter or setter, fields with a Jackson annotation, every field of a `@JsonAutoDetect`
class), project superclasses with their type arguments bound (`Envelope<Map<String, Object>>` makes
`Envelope.data` untyped), the project types of each property, and every project subtype of a
`@JsonTypeInfo` or `@JsonSubTypes` base. Each field is reported once, on the file of the type that
declares it, naming the first handler (by class and method name) that reaches it; the identity is
the declaring type and the field name. Fine: a `Map` with typed values (`Map<String, String>`,
`Map<String, List<String>>`), a static, `transient` or synthetic field, a private field without an
accessor, a property ignored with `@JsonIgnore` (on the field, the getter or the setter, Kotlin's
`@get:JsonIgnore` included) or with `@JsonIgnoreProperties` on the class, `@JsonProperty(access =
READ_ONLY)`, `@JsonDeserialize`, `@JsonAnySetter(enabled = false)`, enums, library types, a field
typed with an unbound type variable, and a `?` argument of a bounded type parameter (it takes the
bound). A type that only a client interface (Feign, `@HttpExchange`) sends, or a handler returns, is
not walked, and neither is a handler parameter without a binding annotation (an implicit model
attribute). A field that is free-form on purpose takes an exception. Kotlin classes are read the
same way; an annotation Kotlin puts on the constructor parameter only (a `@JsonIgnore` without
`@get:` or `@field:`) is not seen.

**Aggregates (jMolecules).** A project that declares its domain model with
[jMolecules](https://github.com/xmolecules/jmolecules) (`org.jmolecules:jmolecules-ddd`, Apache-2.0,
read from the project's own classes; nitpicker adds no dependency) gets its aggregate boundaries
checked. A module with `jmolecules-ddd` on its main compile classpath runs these rules even without
Spring; without `spring-context` on the classpath they are the only rules of this section that run. Membership comes only from
what the code declares, never from class names: an aggregate root implements `AggregateRoot<T, ID>`
or carries `@AggregateRoot`; an entity implementing `Entity<A, ID>` belongs to `A` (also through a
generic base class such as `BaseEntity<Order, LineId>`); an entity carrying `@Entity` (jMolecules')
belongs to every root that reaches it through its fields; a value object implements `ValueObject`
or carries `@ValueObject`. Fields are read with their generic arguments (`List<LineItem>`,
`Map<String, Set<Cart>>`, `? super` bounds, generic arrays, and a type variable as the subclass binds
it), inherited ones included (a field declared in a superclass that is itself a root, entity or value
object is reported there, once), and an `Association<T, ID>` or a field annotated `@Association` is a
reference by identifier, so its type arguments do not count; nor do those of `Class<T>` and the
`java.util.function` types. Abstract classes and interfaces count: an entity typed
`Entity<Shape, ...>` with an interface root `Shape` belongs to every root implementing it.

| Rule                         | Fails when                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ddd-aggregate-reference`    | a root or entity of one aggregate holds the root of another (`Customer customer` in `Order`); hold its identifier (`CustomerId`) or an `Association<Customer, CustomerId>`                                                    |
| `ddd-foreign-entity`         | a root or entity holds an entity that belongs to another aggregate (`List<CartLine>` in `Order` when `CartLine implements Entity<Cart, ...>`), or an `@Entity` that two roots reach (each root is reported, naming the other) |
| `ddd-value-object-reference` | a value object holds an aggregate root or an entity; hold its identifier                                                                                                                                                      |

A class referring to its own type (a root's `parent` of the same root type), a subclass or
supertype of it, or an entity holding its own root is not reported. The detail of `ddd-foreign-entity` is `<aggregate>:<entity>`, so its
identity is `Order|Cart:CartLine`.

**Tests that start a Spring context.** A concrete test class counts when it, an enclosing class or
one of its superclasses (`class X extends AbstractIntegrationTest`) is annotated, directly or
through a composed annotation, with `@SpringBootTest`, any slice test (`@DataJpaTest`, `@WebMvcTest`, ...; all carry
`@BootstrapWith`), `@ContextConfiguration`, `@SpringJUnitConfig`, `@Testcontainers`, or
`@ExtendWith(SpringExtension.class)`. Annotation types (a composed `@IntegrationTest`) and abstract
base classes are not tests themselves and are never placed.

| Rule                        | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spring-test-placement`     | such a test is in the unit test source set (`test` on Gradle, the one test source directory on Maven) and is not an integration test by the shared rule of the [slow-test check](slow-tests.md): a class named `*IT`, `*ITCase`, `*IntegrationTest(s)`, `*IntegrationSpec` or `*ISpec`, or a package with an `integration`, `it` or `e2e` segment. The message offers the forms that keep the package (an `*IT` name, an integration test source set), so a slice test of a package-private controller still compiles; plain unit tests live anywhere |
| `spring-no-dirties-context` | a test class or method has `@DirtiesContext`, anywhere                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

`spring-no-dirties-context` reads every test source set, a separate one such as
`src/integrationTest/java` included; `spring-test-placement` reads only the unit one, since every
other test source set is an integration one. A test that sleeps is covered by the test-honesty rules for
Java, not here.

**Limits.** The rules read bytecode, so generated classes without a source file are skipped (no
finding can be placed), and a use of another package's compile-time constant (`static final` of a
primitive or `String`) is invisible, because `javac` inlines its value. Each Gradle project and Maven module that uses Spring or jMolecules is checked on its own,
over its main and test classes. Kotlin modules run the same rules on their compiled classes, and the
findings point at the `.kt` files; the file facade of top-level functions (`ShopApplicationKt`, with
`fun main`) next to the application or a `@Configuration` class in the root package is not a
`spring-layout` finding, as the class it sits beside is allowed there.
