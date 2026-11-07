# Frameworks

Part of the [Kotlin preset guide](../kotlin-preset.md).

Spring is detected from the compile classpath (`spring-context` or `spring-boot`), Ktor from the
source (`fun Application.module()`). What they require is not flagged: the composition root (the file
with `fun main`, the `@SpringBootApplication` class or a Ktor module) may read `System.getenv`;
`runApplication<App>(*args)` and `SpringApplication.run(App::class.java, *args)` are not
`SpreadOperator` findings in a Spring project; JPA and Spring Data entities are not asked to become
data classes; parameters with an annotation (`@RequestParam`, `@PathVariable`) are not boolean flags.

The Java preset's Spring architecture rules (feature layout, layering, bean lifetimes, request data in singletons (a `companion object` property counts as a static field), untyped fields of request bodies (`Map<String, Any>`, `JsonNode`, `@JsonAnySetter`), and the
jMolecules aggregate rules, which also run without Spring; "Spring architecture rules" in
[java-preset.md](../java-preset.md)) read compiled classes, so they check Kotlin classes the same way, with the same `archunit/<rule>` exceptions and the same `spring.roles` config
key.
