# Java and Kotlin: nitpicker rules

The rules nitpicker adds on top of the JVM tools: ArchUnit architecture rules, Spring configuration findings, the formatter check and the suppression scan, in Java and Kotlin projects. This page lists 27 rules. [All pages](README.md).

The guide for these rules: [docs/java-preset.md](../java-preset.md).

Unless an entry says otherwise:

- **Presets:** Java and Kotlin
- **Analyzers:** `java` (Java); `kotlin` (Kotlin)
- **Builds:** Gradle and Maven
- **Scope:** A project with Spring on the compile classpath.

<a id="archunit-rule"></a>

### `archunit/<rule>`

A rule of the project's own ArchUnit tests.

- **Printed as:** `archunit/<rule>`
- **Why it is on:** The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.
- **Allowed form:** Fix the code the rule's message names.
- **Exception:** If this is intended, add `{"rule":"archunit/<rule>","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#slice-4-archunit)

<a id="archunit-spring-controller-controller"></a>

### `archunit/spring-controller-controller`

A controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Move what both controllers need into a service both call: a controller handles its own requests and does not hold another controller.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-controller","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-controller-entity"></a>

### `archunit/spring-controller-entity`

A request-mapping method of a controller takes or returns an `@Entity` type, also inside a generic.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Take and return a record (DTO) in the controller and map it in the service.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-entity","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-controller-repository"></a>

### `archunit/spring-controller-repository`

A controller depends on a repository or on data access directly (`JdbcTemplate`, `EntityManager`, `DataSource` and the like).

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Have the controller call a service that uses the repository: controllers call services only.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-controller-repository","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-feature-boundary"></a>

### `archunit/spring-feature-boundary`

A class uses a class from a sub-package of another feature; only the classes directly in a feature's package are its public face. When a layering rule reports the same class and dependency, only the layering finding is shown, unless an exception lifts it.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Use only the classes directly in the other feature's package, or move what both need to `<root>.shared`.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-feature-boundary","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-layout"></a>

### `archunit/spring-layout`

A class sits directly in the root package, or in a root sub-package named for a layer (controller, service, repository, entity, dto, util, common, web, api, domain, adapter and the like).

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Package by feature: put the class in `<root>.<feature>` with that feature's controller, service and repository, and pure utilities in `<root>.shared`.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-layout","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-no-dirties-context"></a>

### `archunit/spring-no-dirties-context`

A test class or method has `@DirtiesContext`.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Reset the state in the test itself, or test the class without a Spring context.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-no-dirties-context","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-repository-service"></a>

### `archunit/spring-repository-service`

A repository depends on a `@Service`: a field, parameter, return type or call.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Have the service call the repository and pass it what it needs: a repository only reads and writes data and depends on no service.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-repository-service","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-scope-capture"></a>

### `archunit/spring-scope-capture`

A singleton bean takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Inject `ObjectProvider<T>` and call `getObject()` per use, or give the scoped bean a scoped proxy (`proxyMode = ScopedProxyMode.TARGET_CLASS`).
- **Exception:** If this is intended, add `{"rule":"archunit/spring-scope-capture","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-service-web"></a>

### `archunit/spring-service-web`

A `@Service` or repository depends on the web layer: a controller, `ResponseEntity`, or servlet and Spring web types.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Take and return plain values, throw a domain exception for errors, and map them to web types in the controller or a `@ControllerAdvice`.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-service-web","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-shared-pure"></a>

### `archunit/spring-shared-pure`

A class in `shared` is a Spring bean or an `@Entity`, or depends on a class of another root package.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Keep `shared` to pure utilities; move a bean or an entity to the feature that owns it.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-shared-pure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="archunit-spring-test-placement"></a>

### `archunit/spring-test-placement`

A test that starts a Spring context sits in the unit test source set and is not an integration test by the slow-test rule.

- **Why it is on:** One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.
- **Allowed form:** Test the class with `new` and mocks, or run it as an integration test: name it `*IT` or put it in an integration test source set; a package named `integration` or `it` also counts.
- **Exception:** If this is intended, add `{"rule":"archunit/spring-test-placement","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-architecture-rules)

<a id="errorprone-inlinesuppression"></a>

### `errorprone/InlineSuppression`

An inline suppression of the tool.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence Error Prone inline: fix the finding.
- **Exception:** If this is intended, add `{"rule":"errorprone/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="google-java-format-format"></a>

### `google-java-format/format`

A file is not formatted.

- **Why it is on:** The Java presets keep one layout, the formatter's. google-java-format runs in check mode and reports every file it would change.
- **Allowed form:** Run google-java-format on the file; it fixes the layout.
- **Exception:** If this is intended, add `{"rule":"google-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#style)

<a id="palantir-java-format-format"></a>

### `palantir-java-format/format`

A file is not formatted.

- **Why it is on:** The Java presets keep one layout, the formatter's. palantir-java-format runs in check mode and reports every file it would change.
- **Allowed form:** Run palantir-java-format on the file; it fixes the layout.
- **Exception:** If this is intended, add `{"rule":"palantir-java-format/format","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#style)

<a id="pmd-inlinesuppression"></a>

### `pmd/InlineSuppression`

An inline suppression of the tool.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence PMD inline: fix the finding.
- **Exception:** If this is intended, add `{"rule":"pmd/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spotbugs-inlinesuppression"></a>

### `spotbugs/InlineSuppression`

An inline suppression of the tool.

- **Why it is on:** A suppression annotation hides a finding from the report, so a source scan reports every one.
- **Allowed form:** Do not silence SpotBugs inline: fix the bug.
- **Exception:** If this is intended, add `{"rule":"spotbugs/InlineSuppression","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.

<a id="spring-active-profile"></a>

### `spring/active-profile`

`spring.profiles.active` or `spring.profiles.include` has a literal value in the main (profile-less) document.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Set the active profile from the environment (`SPRING_PROFILES_ACTIVE`), not in the packaged file: it turns those profiles on in every environment.
- **Exception:** If this is intended, add `{"rule":"spring/active-profile","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-actuator-exposure"></a>

### `spring/actuator-exposure`

An actuator endpoint is exposed to the web beyond what is safe: `*`, a sensitive endpoint, unrestricted access, or the shutdown or heapdump endpoint open.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Expose only the endpoints the operation needs (`health`, `info`) and keep the sensitive ones restricted.
- **Exception:** If this is intended, add `{"rule":"spring/actuator-exposure","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-ddl-auto"></a>

### `spring/ddl-auto`

`spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` is neither `none` nor `validate`, or `spring.jpa.generate-ddl` is true.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Manage the schema with Flyway or Liquibase and set the mode to `none` or `validate`.
- **Exception:** If this is intended, add `{"rule":"spring/ddl-auto","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-error-details"></a>

### `spring/error-details`

`server.error.include-stacktrace`, `include-message` or `include-binding-errors` is `always` or `on-param`, or `include-exception` is true.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Set `server.error.include-message=never` and return a fixed `ProblemDetail` from a `@RestControllerAdvice`.
- **Exception:** If this is intended, add `{"rule":"spring/error-details","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-literal-secret"></a>

### `spring/literal-secret`

A literal value under a key that names a secret (`password`, `secret`, `token`, `api-key` and the like), or a URL that carries a credential.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Supply the secret from the environment (a placeholder without a default) or a secret store.
- **Exception:** If this is intended, add `{"rule":"spring/literal-secret","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-missing-enable"></a>

### `spring/missing-enable`

`@Scheduled`, `@Async`, a cache annotation, `@PreAuthorize` or `@Retryable` is used while no main class has the matching `@Enable...` annotation.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Add the matching `@Enable...` annotation to a configuration class, or remove the annotation that does nothing without it.
- **Exception:** If this is intended, add `{"rule":"spring/missing-enable","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-open-in-view"></a>

### `spring/open-in-view`

JPA is used in the main sources and `spring.jpa.open-in-view` is unset or true.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Set `spring.jpa.open-in-view=false`: the default holds a database connection through view rendering and hides N+1 queries.
- **Exception:** If this is intended, add `{"rule":"spring/open-in-view","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-risky-startup-flags"></a>

### `spring/risky-startup-flags`

`spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` is true.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Remove the flag and restructure the beans: it hides wiring problems instead of fixing them.
- **Exception:** If this is intended, add `{"rule":"spring/risky-startup-flags","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="spring-unsafe-diagnostics"></a>

### `spring/unsafe-diagnostics`

SQL logging, Hibernate bind logging at TRACE, the H2 console, or an actuator endpoint that shows values or details is on.

- **Why it is on:** Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.
- **Allowed form:** Turn the diagnostic off in the packaged configuration; enable it only in a local or test profile.
- **Exception:** If this is intended, add `{"rule":"spring/unsafe-diagnostics","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
- **See also:** [Java preset guide](../java-preset.md#spring-configuration-files)

<a id="test-runtime-test-not-run"></a>

### `test-runtime/test-not-run`

A test class that no Test task or Failsafe execution runs.

- **Why it is on:** A test that never runs cannot fail, so it proves nothing.
- **Allowed form:** Register a Test task for its source set (Gradle), or bind the integration-test and verify goals of maven-failsafe-plugin (Maven), so that it runs.
- **Exception:** If this is intended, add `{"rule":"test-runtime/test-not-run","paths":["<path>"],"reason":"..."}` to "exceptions" in nitpicker.config.json.
