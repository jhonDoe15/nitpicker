# Spring test contexts

Spring keeps the application context of a test class and gives it to the next class with the same
configuration. Every distinct set of `@MockBean`, `@MockitoBean`, `@SpyBean` and `@MockitoSpyBean`
fields is part of that configuration, so a `@SpringBootTest` class that mocks one more bean than its
neighbours starts the whole application again. `pmd/SpringContextPerMockSet`
(`languages/java/adapters/review-rules/spring-contexts/`) reports those classes. It is a descriptive
finding: it shows where test time goes and never fails the gate. The rule prints as a PMD rule like
the other test rules, but nitpicker computes it over the test sources of every module.

- **Classes read:** a top-level test class with a test method (`@Test`, `@ParameterizedTest`,
  `@RepeatedTest`, `@TestFactory`, `@TestTemplate`) that carries `@SpringBootTest` itself or through
  its superclasses, when every superclass is in the test sources of the same module.
- **Same configuration:** the class-level annotations of the class and its superclasses are equal as
  written, whatever their order. Annotations that cannot change the context are ignored (`@Slf4j`,
  `@DisplayName`, `@Tag`, `@TestInstance`, `@TestMethodOrder`, `@Transactional`, `@Sql`, `@Timeout`,
  `@RunWith(SpringRunner.class)`, `@ExtendWith(SpringExtension.class)` and the like).
- **Mock beans:** the fields annotated `@MockBean`, `@MockitoBean`, `@SpyBean` or `@MockitoSpyBean` in the
  class and its superclasses, by annotation, arguments and the simple name of the type.
- **Reported:** when classes with the same configuration have three or more distinct sets of mock
  beans, one class of every set except the one most classes use. The message names the mock beans, how
  many more classes use the same set, a class of the largest group and the number of contexts.
- **Not reported:** a class or superclass with `@DirtiesContext`, `@Disabled` or `@Ignore`; a class
  that has a nested `@Configuration` or `@TestConfiguration`, a `@DynamicPropertySource` method, a
  `@ServiceConnection` or `@Container` field, a `@TestBean` or a `@Nested` class of its own (its
  context is its own for another reason); two classes with the same simple name; slices such as
  `@WebMvcTest` and `@DataJpaTest`; files under `exclude`. When the test sources declare a
  `@SpringBootApplication` or `@SpringBootConfiguration`, classes without explicit `classes` are
  compared inside one package only, since the package decides which application class they find. The
  same holds when the main sources of the module hold more than one `@SpringBootApplication`.

Measured on open-source projects: one admin module has 47 test classes with the same configuration,
of which five add one or two mock beans and start five more contexts; a portal module starts eight
contexts for eight controller tests that differ only in the service they mock.

The fix is one of three: declare the mocks in a base class or a `@TestConfiguration` that all the
classes share, test the class with a slice (`@WebMvcTest`, `@DataJpaTest`), or create it with `new`
and plain Mockito. The message ends with the exception sentence for
`{ "rule": "pmd/SpringContextPerMockSet", "paths": ["<file>"], "reason": "..." }`, which hides the
finding for a class that needs its own context. Tests: `adapters/review-rules/spring-contexts/spring-contexts.test.mts`.
