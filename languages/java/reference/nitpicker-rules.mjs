import { entriesFrom, ruleEntry } from '../../../shared/reference/entry.mjs';
import { UNRUN_TEST_EXCEPTION_RULE } from '../adapters/test-runs/unrun-tests.mjs';
import { SPRING_ARCH_RULES } from '../adapters/spring-arch/spring-arch.mjs';
import { JAVA_FORMATTER_TOOLS } from '../adapters/style/java-style.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';

const JVM = { page: 'java-nitpicker', analyzers: JVM_ANALYZERS, builds: JVM_BUILDS };
const SPRING_ONLY = 'A project with Spring on the compile classpath.';

const ARCHUNIT_NOTES = new Map([
  [
    'spring-layout',
    [
      'A class sits directly in the root package, or in a root sub-package named for a layer (controller, service, repository, entity, dto, util, common, web, api, domain, adapter and the like).',
      "Package by feature: put the class in `<root>.<feature>` with that feature's controller, service and repository, and pure utilities in `<root>.shared`.",
    ],
  ],
  [
    'spring-feature-boundary',
    [
      "A class uses a class from a sub-package of another feature; only the classes directly in a feature's package are its public face. When a layering rule reports the same class and dependency, only the layering finding is shown, unless an exception lifts it.",
      "Use only the classes directly in the other feature's package, or move what both need to `<root>.shared`.",
    ],
  ],
  [
    'spring-shared-pure',
    [
      'A class in `shared` is a Spring bean or an `@Entity`, or depends on a class of another root package.',
      'Keep `shared` to pure utilities; move a bean or an entity to the feature that owns it.',
    ],
  ],
  [
    'spring-controller-repository',
    [
      'A controller depends on a repository or on data access directly (`JdbcTemplate`, `EntityManager`, `DataSource` and the like).',
      'Have the controller call a service that uses the repository: controllers call services only.',
    ],
  ],
  [
    'spring-controller-entity',
    [
      'A request-mapping method of a controller takes or returns an `@Entity` type, also inside a generic.',
      'Take and return a record (DTO) in the controller and map it in the service.',
    ],
  ],
  [
    'spring-service-web',
    [
      'A `@Service` or repository depends on the web layer: a controller, `ResponseEntity`, or servlet and Spring web types.',
      'Take and return plain values, throw a domain exception for errors, and map them to web types in the controller or a `@ControllerAdvice`.',
    ],
  ],
  [
    'spring-controller-controller',
    [
      'A controller holds or creates another controller: a field, constructor or method parameter of that type, also inside a generic, or `new OtherController()`.',
      'Move what both controllers need into a service both call: a controller handles its own requests and does not hold another controller.',
    ],
  ],
  [
    'spring-repository-service',
    [
      'A repository depends on a `@Service`: a field, parameter, return type or call.',
      'Have the service call the repository and pass it what it needs: a repository only reads and writes data and depends on no service.',
    ],
  ],
  [
    'spring-scope-capture',
    [
      'A singleton bean takes a request-, session-, `websocket`-, Spring Batch `step`- or `job`-scoped bean without a scoped proxy.',
      'Inject `ObjectProvider<T>` and call `getObject()` per use, or give the scoped bean a scoped proxy (`proxyMode = ScopedProxyMode.TARGET_CLASS`).',
    ],
  ],
  [
    'spring-test-placement',
    [
      'A test that starts a Spring context sits in the unit test source set and is not an integration test by the slow-test rule.',
      'Test the class with `new` and mocks, or run it as an integration test: name it `*IT` or put it in an integration test source set; a package named `integration` or `it` also counts.',
    ],
  ],
  [
    'spring-no-dirties-context',
    [
      'A test class or method has `@DirtiesContext`.',
      'Reset the state in the test itself, or test the class without a Spring context.',
    ],
  ],
]);

function archunitRows() {
  return SPRING_ARCH_RULES.map((rule) => {
    const notes = ARCHUNIT_NOTES.get(rule);
    if (notes === undefined) {
      throw new Error(`The rule reference has no text for the ArchUnit rule ${rule}`);
    }
    return [rule, ...notes];
  });
}

const SPRING_CONFIG_ROWS = [
  [
    'open-in-view',
    'JPA is used in the main sources and `spring.jpa.open-in-view` is unset or true.',
    'Set `spring.jpa.open-in-view=false`: the default holds a database connection through view rendering and hides N+1 queries.',
  ],
  [
    'ddl-auto',
    '`spring.jpa.hibernate.ddl-auto` or `spring.jpa.properties.hibernate.hbm2ddl.auto` is neither `none` nor `validate`, or `spring.jpa.generate-ddl` is true.',
    'Manage the schema with Flyway or Liquibase and set the mode to `none` or `validate`.',
  ],
  [
    'risky-startup-flags',
    '`spring.main.allow-circular-references`, `allow-bean-definition-overriding` or `lazy-initialization` is true.',
    'Remove the flag and restructure the beans: it hides wiring problems instead of fixing them.',
  ],
  [
    'actuator-exposure',
    'An actuator endpoint is exposed to the web beyond what is safe: `*`, a sensitive endpoint, unrestricted access, or the shutdown or heapdump endpoint open.',
    'Expose only the endpoints the operation needs (`health`, `info`) and keep the sensitive ones restricted.',
  ],
  [
    'error-details',
    '`server.error.include-stacktrace`, `include-message` or `include-binding-errors` is `always` or `on-param`, or `include-exception` is true.',
    'Set `server.error.include-message=never` and return a fixed `ProblemDetail` from a `@RestControllerAdvice`.',
  ],
  [
    'unsafe-diagnostics',
    'SQL logging, Hibernate bind logging at TRACE, the H2 console, or an actuator endpoint that shows values or details is on.',
    'Turn the diagnostic off in the packaged configuration; enable it only in a local or test profile.',
  ],
  [
    'active-profile',
    '`spring.profiles.active` or `spring.profiles.include` has a literal value in the main (profile-less) document.',
    'Set the active profile from the environment (`SPRING_PROFILES_ACTIVE`), not in the packaged file: it turns those profiles on in every environment.',
  ],
  [
    'missing-enable',
    '`@Scheduled`, `@Async`, a cache annotation, `@PreAuthorize` or `@Retryable` is used while no main class has the matching `@Enable...` annotation.',
    'Add the matching `@Enable...` annotation to a configuration class, or remove the annotation that does nothing without it.',
  ],
  [
    'literal-secret',
    'A literal value under a key that names a secret (`password`, `secret`, `token`, `api-key` and the like), or a URL that carries a credential.',
    'Supply the secret from the environment (a placeholder without a default) or a secret store.',
  ],
];

const SUPPRESSION_TOOLS = {
  pmd: 'Do not silence PMD inline: fix the finding.',
  spotbugs: 'Do not silence SpotBugs inline: fix the bug.',
  errorprone: 'Do not silence Error Prone inline: fix the finding.',
};

function formatEntry({ tool, label }) {
  return ruleEntry({
    ...JVM,
    tool,
    rule: 'format',
    summary: 'A file is not formatted',
    why: `The Java presets keep one layout, the formatter's. ${label} runs in check mode and reports every file it would change.`,
    allowed: `Run ${label} on the file; it fixes the layout.`,
    exception: { key: 'exceptions', rule: `${tool}/format` },
    docs: [{ label: 'Java preset guide', path: 'docs/java-preset.md', anchor: 'style' }],
  });
}

function suppressionEntries() {
  return Object.entries(SUPPRESSION_TOOLS).map(([tool, allowed]) =>
    ruleEntry({
      ...JVM,
      tool,
      rule: 'InlineSuppression',
      summary: 'An inline suppression of the tool',
      why: 'A suppression annotation hides a finding from the report, so a source scan reports every one.',
      allowed,
      exception: { key: 'exceptions', rule: `${tool}/InlineSuppression` },
    }),
  );
}

function archunitEntries() {
  return [
    ...entriesFrom(
      {
        ...JVM,
        tool: 'archunit',
        why: "One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes of a Spring project: it keeps the package-by-feature layout and the layering of the TypeScript preset.",
        scope: SPRING_ONLY,
        docs: [
          {
            label: 'Java preset guide',
            path: 'docs/java-preset.md',
            anchor: 'spring-architecture-rules',
          },
        ],
      },
      archunitRows(),
    ),
    ruleEntry({
      ...JVM,
      tool: 'archunit',
      rule: '<rule>',
      pattern: `^(?!(?:${SPRING_ARCH_RULES.join('|')})$)`,
      summary: "A rule of the project's own ArchUnit tests",
      why: 'The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.',
      allowed: "Fix the code the rule's message names.",
      exception: { key: 'exceptions', rule: 'archunit/<rule>' },
      docs: [
        { label: 'Java preset guide', path: 'docs/java-preset.md', anchor: 'slice-4-archunit' },
      ],
    }),
  ];
}

function springConfigEntries() {
  return [
    ...entriesFrom(
      {
        ...JVM,
        tool: 'spring',
        why: 'Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.',
        scope: SPRING_ONLY,
        docs: [
          {
            label: 'Java preset guide',
            path: 'docs/java-preset.md',
            anchor: 'spring-configuration-files',
          },
        ],
      },
      SPRING_CONFIG_ROWS,
    ),
  ];
}

/** The entries of the rules nitpicker itself adds to the Java and Kotlin presets. */
export function jvmNitpickerEntries() {
  const formatters = [JAVA_FORMATTER_TOOLS.google, JAVA_FORMATTER_TOOLS.palantir];
  return [
    ...archunitEntries(),
    ...springConfigEntries(),
    ruleEntry({
      ...JVM,
      tool: 'test-runtime',
      rule: 'test-not-run',
      summary: 'A test class that no Test task or Failsafe execution runs.',
      why: 'A test that never runs cannot fail, so it proves nothing.',
      allowed:
        'Register a Test task for its source set (Gradle), or bind the integration-test and verify goals of maven-failsafe-plugin (Maven), so that it runs.',
      exception: { key: 'exceptions', rule: UNRUN_TEST_EXCEPTION_RULE },
    }),
    ...formatters.map(formatEntry),
    ...suppressionEntries(),
  ];
}
