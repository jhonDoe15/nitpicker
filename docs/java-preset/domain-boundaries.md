# Domain boundaries

Part of the [Java preset guide](../java-preset.md).

Domain code holds the rules of the business and nothing else: it gets its data passed in and
reaches the outside world only through interfaces (ports) it declares itself, which adapters
implement and the composition root wires. The rules apply to every production class in a package
with a `domain` segment (`com.acme.orders.domain`, `com.acme.domain.model`) unless the package also
has an adapter segment, the same convention the [Python preset](../python-preset.md) and the
TypeScript `features/<f>/domain/` folders use, without imposing a folder layout. They read the
same class graph as [Feature packages](feature-packages.md) (`adapters/domain/`), so they cover Gradle
and Maven, Java and Kotlin, and every module, and run under the tool `coupling`:

| Rule                               | Fails when a domain class uses                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-imports-adapter`           | a project class in a package with an `adapter`, `adapters`, `infrastructure` or `infra` segment                                                                                                                                                                                                                                                                       |
| `domain-imports-io`                | file, network, thread or process work: `java.io.File*`, `RandomAccessFile`, `java.nio.file.Files`, file and socket channels, `java.net` sockets, `URLConnection`, `InetAddress`, `java.net.http`, `ProcessBuilder`, `Runtime`, `Thread`, `Timer`, executors and pools, Kotlin `kotlin.io` file functions and `kotlin.concurrent`                                      |
| `domain-imports-client`            | a database, HTTP or messaging client: JDBC, `javax.sql`, JPA `EntityManager*` and queries, Hibernate sessions, Spring `jdbc`, `r2dbc`, `web.client`, `web.reactive.function.client`, Spring Data templates and repository types, OkHttp, Apache HttpClient, Feign, Retrofit, Ktor client, Kafka, AMQP, JMS, Redis and MongoDB clients, AWS and Google Cloud data SDKs |
| `domain-imports-logger`            | a logger: SLF4J, `java.util.logging`, `System.Logger`, Log4j, Logback, Commons Logging, JBoss Logging, kotlin-logging                                                                                                                                                                                                                                                 |
| `domain-imports-random`            | a random or id source: `Random`, `SecureRandom`, `ThreadLocalRandom`, `SplittableRandom`, `java.util.random`, `kotlin.random`, Commons random utilities, ULID and UUID generators, fake-data libraries, or a `UUID.randomUUID()` / `Uuid.random()` call                                                                                                               |
| `domain-imports-framework-context` | the framework container: Spring `ApplicationContext`, `BeanFactory`, their `*Aware` callbacks and `Environment`, CDI, Micronaut and Quarkus lookups                                                                                                                                                                                                                   |
| `domain-reaches-io`                | a project class outside the domain and adapter packages whose own dependencies reach a class of `domain-imports-io`, `-client` or `-logger`                                                                                                                                                                                                                           |

```java
package com.acme.orders.domain;

public final class OrderNumbers {
  private final IdSource ids;                                   // allowed: a port the domain declares
  public OrderNumbers(IdSource ids) { this.ids = ids; }
  String next() { return UUID.randomUUID().toString(); }        // domain-imports-random
}
```

- **Values stay allowed.** A `Path`, `URI`, `UUID`, `Instant` or `Duration` is a value and may be
  passed around; the JPA mapping annotations (`@Entity`, `@Id`, `@Column`) are not in the client
  list, so a domain model annotated for JPA is fine. jdeps does not tell
  `UUID.randomUUID()` from `UUID.fromString(...)` (both use the class `UUID`), so that call is found
  in the domain sources, with comments and strings blanked out (`adapters/domain/random-sources.mjs`,
  also `import static java.util.UUID.randomUUID` and Kotlin's `kotlin.uuid.Uuid.random()`).
- **One finding per cause.** `domain-imports-adapter` is one finding per domain file and adapter
  file, identity `domain-adapter:<adapter file>`; the library rules one per domain file and library
  package, identity `library:<package>`, naming every class used from it; `domain-reaches-io` one per
  domain file and first helper file, identity `domain-reach:<helper file>`. Each message names the
  domain class and what it uses, then says what to do instead (a port in the domain implemented in
  an adapter, or a value passed in), and ends with the exception entry:
  `{ "rule": "coupling/domain-imports-io", "paths": ["src/main/java/com/acme/orders/domain/Order.java"], "reason": "..." }`.
- **Reach-through.** `domain-reaches-io` follows dependencies through project classes that are
  neither domain nor adapter (a shared helper, a service of another package) to the nearest class
  that uses I/O, a client or a logger, and shows the path:
  `Order uses Pricing -> PriceStore, which uses JdbcTemplate, ...`. It stops at domain classes
  (they get their own findings) and at adapters (`domain-imports-adapter` reports those). Random
  sources and the container are not followed, as in TypeScript.
- **Other presets.** TypeScript and JavaScript enforce the same concerns with their own
  dependency-cruiser rules (`domain-does-not-import-adapters`, `-node-io`,
  `-network-or-database-clients`, `-the-logger`, `-id-libraries`,
  `domain-does-not-reach-io-through-shared`); Python with `io-in-domain` and `random-in-domain`.
  [spec/checks.md](../../spec/checks.md#custom-rules) shows which preset enforces which rule.
- **Limits.** As for the feature rules, jdeps reads bytecode: a compile-time constant leaves no
  edge, reflection and wiring by name are invisible, and a Kotlin `inline` function from a library
  is copied into the domain class, so the edge is to what its body uses. A clock read
  (`Instant.now()`) is not checked.
- **Tests.** `adapters/domain/*.test.mjs` (the class lists, the roles, every rule with its message,
  the source scan and the reach path) and the `domain` branch of the Java preset e2e project.
