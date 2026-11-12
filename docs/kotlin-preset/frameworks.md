# Frameworks

Part of the [Kotlin preset guide](../kotlin-preset.md).

Spring is detected from the compile classpath (`spring-context` or `spring-boot`), Ktor from the
source (`fun Application.module()`). What they require is not flagged: the composition root (the file
with `fun main`, a `@JvmStatic fun main` in an `object` or companion object, the `@SpringBootApplication`
class or a Ktor module) may read `System.getenv` and application system properties (so may a file with a
framework's configuration type: Spring `@Configuration`, Micronaut `@Factory`, a Dagger or Guice module, CDI
`@Produces`; see `ConfigurationReadOutsideCompositionRoot` in [Source checks](source-checks.md)) and
reference `System.out` and `System.err` (`show(System.out)`, `items.forEach(System.out::println)`);
`runApplication<App>(*args)` and `SpringApplication.run(App::class.java, *args)` are not
`SpreadOperator` findings in a Spring project; JPA and Spring Data entities are not asked to become
data classes; parameters with an annotation (`@RequestParam`, `@PathVariable`) are not boolean flags.

The Java preset's Spring architecture rules (feature layout, layering, bean lifetimes, request data in singletons (a `companion object` property counts as a static field), untyped fields of request bodies (`Map<String, Any>`, `JsonNode`, `@JsonAnySetter`), and the
jMolecules aggregate rules, which also run without Spring; "Spring architecture rules" in
[java-preset.md](../java-preset.md)) read compiled classes, so they check Kotlin classes the same way, with the same `archunit/<rule>` exceptions and the same `spring.roles` config
key. So does `archunit/contract-infrastructure-type` ([contract types](../java-preset/spring-architecture-rules.md#contract-types)),
also in a Kotlin project without Spring that has feature folders. It sees through type aliases
(`typealias Rows = List<Connection>`) and leaves out property getters and setters, the `componentN` and
`copy` functions of data classes, and `internal` functions.
