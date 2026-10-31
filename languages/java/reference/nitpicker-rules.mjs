import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { asSentence } from '../../../shared/reference/build/text.mjs';
import { adviceOf } from '../../../shared/reference/build/messages.mjs';
import { guideCell } from '../../../shared/reference/build/guide-tables.mjs';
import {
  UNRUN_TEST_ADVICE,
  UNRUN_TEST_EXCEPTION_RULE,
} from '../adapters/test-runs/unrun-tests.mjs';
import { SPRING_ARCH_MESSAGES, SPRING_ARCH_RULES } from '../adapters/spring-arch/spring-arch.mjs';
import { JAVA_FORMATTER_TOOLS } from '../adapters/style/java-style.mjs';
import { javaFormatMessage } from '../adapters/reporting/format-findings.mjs';
import { INLINE_SUPPRESSION_MESSAGES } from '../adapters/suppressions/java-suppressions.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';
import { springConfigForms } from './spring-config-messages.mjs';

const GUIDE = 'docs/java-preset.md';
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
    exception: { key: 'exceptions', rule: `archunit/${rule}` },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'spring-architecture-rules' }],
  });
}

function archunitEntries() {
  return [
    ...SPRING_ARCH_RULES.map(archunitEntry),
    ruleEntry({
      ...JVM,
      tool: 'archunit',
      rule: '<rule>',
      pattern: `^(?!(?:${SPRING_ARCH_RULES.join('|')})$)`,
      samples: ['archunit/noCyclesBetweenFeatures'],
      summary: "A rule of the project's own ArchUnit tests.",
      why: 'The project writes ArchUnit rules as tests named `*ArchTest` or `*ArchitectureTest`; nitpicker runs them and reports each violated rule by the name of its test field or method.',
      allowed: "Fix the code the rule's message names.",
      exception: { key: 'exceptions', rule: 'archunit/<rule>' },
      docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'slice-4-archunit' }],
    }),
  ];
}

function springConfigEntries() {
  return [...springConfigForms()].map(([rule, forms]) =>
    ruleEntry({
      ...JVM,
      tool: 'spring',
      rule,
      summary: asSentence(guideCell(GUIDE, rule, 'fires on')),
      why: 'Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.',
      scope: SPRING_ONLY,
      forms,
      exception: { key: 'exceptions', rule: `spring/${rule}` },
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
    exception: { key: 'exceptions', rule: `${tool}/format` },
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
      exception: { key: 'exceptions', rule: `${tool}/InlineSuppression` },
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
    exception: { key: 'exceptions', rule: UNRUN_TEST_EXCEPTION_RULE },
    docs: [{ label: 'Java preset guide', path: GUIDE, anchor: 'tests-that-never-run' }],
  });
}

/** The entries of the rules nitpicker itself adds to the Java and Kotlin presets. */
export function jvmNitpickerEntries() {
  return [
    ...archunitEntries(),
    ...springConfigEntries(),
    unrunTestEntry(),
    formatEntry('google'),
    formatEntry('palantir'),
    ...suppressionEntries(),
  ];
}
