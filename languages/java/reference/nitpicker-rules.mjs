import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { counterpartsOf } from '../../../shared/reference/counterparts.mjs';
import { asSentence } from '../../../shared/reference/build/text.mjs';
import { adviceOf } from '../../../shared/reference/build/messages.mjs';
import { guideCell } from '../../../shared/reference/build/guide-tables.mjs';
import {
  UNRUN_TEST_ADVICE,
  UNRUN_TEST_EXCEPTION_RULE,
} from '../adapters/test-runs/unrun-tests.mjs';
import { SPRING_ARCH_MESSAGES, SPRING_ARCH_RULES } from '../adapters/spring-arch/spring-arch.mjs';
import { CONTRACT_RULE, contractEntry } from '../adapters/spring-arch/contract-types.mjs';
import { JAVA_FORMATTER_TOOLS } from '../adapters/style/java-style.mjs';
import { javaFormatMessage } from '../adapters/reporting/format-findings.mjs';
import { INLINE_SUPPRESSION_MESSAGES } from '../adapters/suppressions/java-suppressions.mjs';
import {
  COMMENTED_OUT_CODE_MESSAGE,
  COMMENTED_OUT_CODE_RULE,
  TASK_MARKER_RULE,
} from '../adapters/comments/comment-findings.mjs';
import { TASK_MARKER_MESSAGE } from '../adapters/comments/task-markers.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';
import {
  COPIED_CONSTANT_EXCEPTION_RULE,
  COPIED_CONSTANT_PIN,
  COPIED_CONSTANT_RULE,
} from '../adapters/review-rules/copied-constants/copied-constants.mjs';
import { copiedConstantMessage } from '../../../shared/rules/copied-constants/copied-constants.mjs';
import { springConfigForms } from './spring-config-messages.mjs';
import {
  ROUND_TRIP_EXCEPTION_RULE,
  ROUND_TRIP_RULE,
} from '../adapters/review-rules/round-trips/round-trips.mjs';
import { roundTripMessage } from '../../../shared/rules/round-trips/round-trips.mjs';

const GUIDE = 'docs/java-preset.md';
const EXCEPTIONS_KEY = 'exceptions';
const JVM = { page: 'java-nitpicker', analyzers: JVM_ANALYZERS, builds: JVM_BUILDS };
const SPRING_ONLY = 'A project with Spring on the compile classpath.';
const JMOLECULES_ONLY =
  'A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.';
const ARCHUNIT_WHY =
  "One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.";
const SAMPLE_TARGET = {
  rootPackage: '<root>.<feature>',
  packageName: '<root>.<feature>.<package>',
};
const SAMPLE_DETAILS = {
  'spring-layout': '<layer>',
  'spring-feature-boundary': '<OtherClass>',
  'spring-shared-pure': '<OtherClass>',
  'spring-controller-repository': '<Repository>',
  'spring-controller-entity': '<method>:<Entity>',
  'spring-service-web': '<WebType>',
  'spring-controller-controller': '<OtherController>',
  'spring-repository-service': '<Service>',
  'spring-scope-capture': '<scope>:<ScopedBean>',
  'ddd-aggregate-reference': '<OtherRoot>',
  'ddd-foreign-entity': '<Aggregate>:<Entity>',
  'ddd-value-object-reference': '<Entity>',
  'spring-request-state': '<field>:<mutator>:<request source>',
  'spring-typed-request-field': '<Type>.<field>:field:<Controller>.<method>',
  'spring-unmapped-exception': '<method>:<Exception>:<Service>.<method>',
};
const TEST_RULES = new Set(['spring-test-placement', 'spring-no-dirties-context']);
const DDD_PREFIX = 'ddd-';

function archunitAdvice(rule) {
  return SPRING_ARCH_MESSAGES[rule]({
    simple: TEST_RULES.has(rule) ? '<Name>Test' : '<Class>',
    detail: SAMPLE_DETAILS[rule] ?? '<detail>',
    root: '<root>',
    target: SAMPLE_TARGET,
  });
}

function archunitEntry(rule) {
  return ruleEntry({
    ...JVM,
    tool: 'archunit',
    rule,
    summary: asSentence(guideCell(GUIDE, rule, 'fails when')),
    why: ARCHUNIT_WHY,
    allowed: archunitAdvice(rule),
    scope: rule.startsWith(DDD_PREFIX) ? JMOLECULES_ONLY : SPRING_ONLY,
    exception: { key: EXCEPTIONS_KEY, rule: `archunit/${rule}` },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'spring-architecture-rules' }],
  });
}

function contractTypeEntry() {
  return ruleEntry({
    ...JVM,
    tool: 'archunit',
    rule: CONTRACT_RULE,
    summary: asSentence(guideCell(GUIDE, CONTRACT_RULE, 'fails when')),
    why: ARCHUNIT_WHY,
    allowed: contractEntry('<Class>', 'service|persistence|<method>:<PersistenceHandle>').message,
    scope: 'A project with Spring, or with feature folders, in its main sources.',
    exception: { key: EXCEPTIONS_KEY, rule: `archunit/${CONTRACT_RULE}` },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'spring-architecture-rules' }],
  });
}

function archunitEntries() {
  const ownRules = [...SPRING_ARCH_RULES, CONTRACT_RULE];
  return [
    ...SPRING_ARCH_RULES.map(archunitEntry),
    contractTypeEntry(),
    ruleEntry({
      ...JVM,
      tool: 'archunit',
      rule: '<rule>',
      pattern: `^(?!(?:${ownRules.join('|')})$)`,
      samples: ['archunit/noCyclesBetweenFeatures'],
      summary: "A rule of the project's own ArchUnit tests.",
      why: 'The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.',
      allowed: "Fix the code the rule's message names.",
      exception: { key: EXCEPTIONS_KEY, rule: 'archunit/<rule>' },
      docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'slice-4-archunit' }],
    }),
  ];
}

const SPRING_CONFIG_WHY = {
  default:
    'Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.',
  'missing-enable':
    'An annotation such as `@Scheduled` or `@Async` does nothing until the matching `@Enable...` is present, and Spring raises no error when it is missing.',
  'unbound-property':
    'Spring ignores a key that binds to no property, so a misspelled or removed setting silently never takes effect.',
};

function springConfigEntries() {
  return [...springConfigForms()].map(([rule, forms]) =>
    ruleEntry({
      ...JVM,
      tool: 'spring',
      rule,
      summary: asSentence(guideCell(GUIDE, rule, 'fires on')),
      why: SPRING_CONFIG_WHY[rule] ?? SPRING_CONFIG_WHY.default,
      scope: SPRING_ONLY,
      forms,
      exception: { key: EXCEPTIONS_KEY, rule: `spring/${rule}` },
      docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'spring-configuration-files' }],
    }),
  );
}

function formatEntry(style) {
  const { tool, label } = JAVA_FORMATTER_TOOLS[style];
  return ruleEntry({
    ...JVM,
    tool,
    rule: 'format',
    summary: `A Java file is not formatted with ${label}.`,
    why: `The Java presets keep one layout, the formatter's. ${label} runs in check mode and reports every file it would change.`,
    allowed: javaFormatMessage(style),
    exception: { key: EXCEPTIONS_KEY, rule: `${tool}/format` },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'style' }],
  });
}

function suppressionEntries() {
  return Object.entries(INLINE_SUPPRESSION_MESSAGES).map(([tool, allowed]) =>
    ruleEntry({
      ...JVM,
      tool,
      rule: 'InlineSuppression',
      summary: `An inline suppression of ${tool} in a Java source.`,
      why: 'A suppression annotation hides a finding from the report, so a source scan reports every one.',
      allowed,
      exception: { key: EXCEPTIONS_KEY, rule: `${tool}/InlineSuppression` },
    }),
  );
}

function commentEntries() {
  return [
    {
      rule: TASK_MARKER_RULE,
      summary:
        'A `TODO`, `FIXME`, `XXX`, `HACK` or `STOPSHIP` comment in a Java source with no issue reference.',
      why: 'A task marker without an issue is never picked up, so it stays in the code for good.',
      allowed: TASK_MARKER_MESSAGE,
    },
    {
      rule: COMMENTED_OUT_CODE_RULE,
      summary: 'A comment in a Java source whose lines read as Java statements or declarations.',
      why: 'Commented-out code goes stale and hides what is live; version control keeps the old version.',
      allowed: COMMENTED_OUT_CODE_MESSAGE,
    },
  ].map(({ rule, ...entry }) =>
    ruleEntry({
      ...JVM,
      tool: 'pmd',
      rule,
      ...entry,
      exception: { key: EXCEPTIONS_KEY, rule: `pmd/${rule}` },
    }),
  );
}

function unrunTestEntry() {
  return ruleEntry({
    ...JVM,
    tool: 'test-runtime',
    rule: 'test-not-run',
    summary: 'A test class that no Test task or Failsafe execution runs.',
    why: 'A test that never runs cannot fail, so it proves nothing.',
    forms: [
      {
        label: 'Gradle',
        message: adviceOf(UNRUN_TEST_ADVICE.gradle({ sourceSet: '<sourceSet>', test: '<Test>' })),
      },
      { label: 'Maven', message: adviceOf(UNRUN_TEST_ADVICE.maven({ test: '<Test>IT' })) },
    ],
    exception: { key: EXCEPTIONS_KEY, rule: UNRUN_TEST_EXCEPTION_RULE },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'tests-that-never-run' }],
  });
}

function roundTripEntry() {
  return ruleEntry({
    ...JVM,
    tool: 'pmd',
    rule: ROUND_TRIP_RULE,
    summary:
      'Two public methods of one main-source class or file that turn values into each other (`toJson`/`fromJson`, `encode`/`decode`), with no test that calls both.',
    why: 'A field that one half drops or garbles passes every test that checks each half alone. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.',
    allowed: roundTripMessage({
      first: '<Owner>.<encode>',
      second: '<Owner>.<decode>',
      example: 'assertEquals(value, <Owner>.<decode>(<Owner>.<encode>(value)))',
    }),
    exception: { key: EXCEPTIONS_KEY, rule: ROUND_TRIP_EXCEPTION_RULE },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'round-trip-tests' }],
  });
}

function copiedConstantEntry() {
  return ruleEntry({
    ...JVM,
    tool: 'pmd',
    rule: COPIED_CONSTANT_RULE,
    summary:
      'A string or number literal in a test that equals an `UPPER_SNAKE` constant of a main-source class, object or file the test can see.',
    why: 'When the constant changes, a test that holds a copy of its value keeps checking the old value, or a boundary test stops testing the boundary. Nitpicker computes it over the sources of every module and prints it as a PMD rule, like the other test honesty rules.',
    allowed: copiedConstantMessage({
      names: ['<Owner>.<NAME>'],
      owner: '<file>',
      literal: { kind: 'number', value: '<value>' },
      pin: COPIED_CONSTANT_PIN,
    }),
    exception: { key: EXCEPTIONS_KEY, rule: COPIED_CONSTANT_EXCEPTION_RULE },
    docs: [
      { label: 'Java preset guide', path: GUIDE, anchor: 'tests-that-copy-a-constant' },
      ...counterpartsOf(COPIED_CONSTANT_EXCEPTION_RULE),
    ],
  });
}

/** The entries of the rules nitpicker itself adds to the Java and Kotlin presets. */
export function jvmNitpickerEntries() {
  return [
    ...archunitEntries(),
    ...springConfigEntries(),
    unrunTestEntry(),
    roundTripEntry(),
    copiedConstantEntry(),
    formatEntry('google'),
    formatEntry('palantir'),
    ...suppressionEntries(),
    ...commentEntries(),
  ];
}
