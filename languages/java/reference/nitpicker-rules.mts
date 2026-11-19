import {
  adviceOf,
  asSentence,
  counterpartsOf,
  guideCell,
  ruleEntry,
} from './typed/entry-views.mts';
import type { RuleEntry } from './typed/entry-views.mts';
import { SAMPLE_DETAILS, SAMPLE_TARGET, SPRING_CONFIG_WHY } from './typed/rule-samples.mts';
import {
  UNRUN_TEST_ADVICE,
  UNRUN_TEST_EXCEPTION_RULE,
} from '../adapters/test-runs/unrun-tests.mts';
import { SPRING_ARCH_MESSAGES, SPRING_ARCH_RULES } from '../adapters/spring-arch/spring-arch.mts';
import { CONTRACT_RULE, contractEntry } from '../adapters/spring-arch/contract-types.mts';
import { JAVA_FORMATTER_TOOLS } from '../adapters/style/java-style.mts';
import { javaFormatMessage } from '../adapters/reporting/format-findings.mts';
import { INLINE_SUPPRESSION_MESSAGES } from '../adapters/suppressions/java-suppressions.mts';
import {
  COMMENTED_OUT_CODE_MESSAGE,
  COMMENTED_OUT_CODE_RULE,
  TASK_MARKER_RULE,
} from '../adapters/comments/comment-findings.mts';
import { TASK_MARKER_MESSAGE } from '../adapters/comments/task-markers.mts';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mts';
import {
  COPIED_CONSTANT_EXCEPTION_RULE,
  COPIED_CONSTANT_PIN,
  COPIED_CONSTANT_RULE,
} from '../adapters/review-rules/copied-constants/copied-constants.mts';
import {
  COPY_PASTED_TEST_EXCEPTION_RULE,
  COPY_PASTED_TEST_RULE,
  copyPastedTestMessage,
} from '../adapters/review-rules/copy-pasted-tests/copy-pasted-tests.mts';
import { copiedConstantMessage } from '../../../shared/rules/copied-constants/copied-constants.mjs';
import { maxValueEntry } from './review-entries/max-value.mts';
import { nullFallThroughEntry } from './review-entries/null-fall-through.mts';
import { springConfigForms } from './spring-config-messages.mts';
import {
  ROUND_TRIP_EXCEPTION_RULE,
  ROUND_TRIP_RULE,
} from '../adapters/review-rules/round-trips/round-trips.mts';
import { roundTripMessage } from '../../../shared/rules/round-trips/round-trips.mjs';

const GUIDE = 'docs/java-preset.md';
const GUIDE_LABEL = 'Java preset guide';
const EXCEPTIONS_KEY = 'exceptions';
const JVM = { page: 'java-nitpicker', analyzers: JVM_ANALYZERS, builds: JVM_BUILDS };
const SPRING_ONLY = 'A project with Spring on the compile classpath.';
const JMOLECULES_ONLY =
  'A module with jMolecules (`org.jmolecules:jmolecules-ddd`) on its main compile classpath, with or without Spring.';
const ARCHUNIT_WHY =
  "One of nitpicker's own architecture rules, run with ArchUnit over the compiled classes: it keeps the package-by-feature layout, the layering and the aggregate boundaries that the TypeScript preset keeps with its import rules.";
const TEST_RULES = new Set(['spring-test-placement', 'spring-no-dirties-context']);
const DDD_PREFIX = 'ddd-';

function archunitAdvice(rule: string): string {
  const message = SPRING_ARCH_MESSAGES[rule];
  if (message === undefined) {
    throw new Error(`No ArchUnit message for ${rule}`);
  }
  return message({
    simple: TEST_RULES.has(rule) ? '<Name>Test' : '<Class>',
    detail: SAMPLE_DETAILS[rule] ?? '<detail>',
    root: '<root>',
    target: SAMPLE_TARGET,
  });
}

function archunitEntry(rule: string): RuleEntry {
  return ruleEntry({
    ...JVM,
    tool: 'archunit',
    rule,
    summary: asSentence(guideCell(GUIDE, rule, 'fails when')),
    why: ARCHUNIT_WHY,
    allowed: archunitAdvice(rule),
    scope: rule.startsWith(DDD_PREFIX) ? JMOLECULES_ONLY : SPRING_ONLY,
    exception: { key: EXCEPTIONS_KEY, rule: `archunit/${rule}` },
    docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'spring-architecture-rules' }],
  });
}

function contractTypeEntry(): RuleEntry {
  return ruleEntry({
    ...JVM,
    tool: 'archunit',
    rule: CONTRACT_RULE,
    summary: asSentence(guideCell(GUIDE, CONTRACT_RULE, 'fails when')),
    why: ARCHUNIT_WHY,
    allowed: contractEntry('<Class>', 'service|persistence|<method>:<PersistenceHandle>').message,
    scope: 'A project with Spring, or with feature folders, in its main sources.',
    exception: { key: EXCEPTIONS_KEY, rule: `archunit/${CONTRACT_RULE}` },
    docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'spring-architecture-rules' }],
  });
}

function archunitEntries(): RuleEntry[] {
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
      docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'slice-4-archunit' }],
    }),
  ];
}

function springConfigEntries(): RuleEntry[] {
  return [...springConfigForms()].map(([rule, forms]) =>
    ruleEntry({
      ...JVM,
      tool: 'spring',
      rule,
      summary: asSentence(guideCell(GUIDE, rule, 'fires on')),
      why: SPRING_CONFIG_WHY[rule] ?? SPRING_CONFIG_WHY['default'],
      scope: SPRING_ONLY,
      forms,
      exception: { key: EXCEPTIONS_KEY, rule: `spring/${rule}` },
      docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'spring-configuration-files' }],
    }),
  );
}

function formatEntry(style: string): RuleEntry {
  const { tool, label } = JAVA_FORMATTER_TOOLS[style] ?? { tool: style, label: style };
  return ruleEntry({
    ...JVM,
    tool,
    rule: 'format',
    summary: `A Java file is not formatted with ${label}.`,
    why: `The Java presets keep one layout, the formatter's. ${label} runs in check mode and reports every file it would change.`,
    allowed: javaFormatMessage(style),
    exception: { key: EXCEPTIONS_KEY, rule: `${tool}/format` },
    docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'style' }],
  });
}

function suppressionEntries(): RuleEntry[] {
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

function commentEntries(): RuleEntry[] {
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

function unrunTestEntry(): RuleEntry {
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
    docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'tests-that-never-run' }],
  });
}

function roundTripEntry(): RuleEntry {
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
    docs: [{ label: GUIDE_LABEL, path: GUIDE, anchor: 'round-trip-tests' }],
  });
}

function copiedConstantEntry(): RuleEntry {
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
      { label: GUIDE_LABEL, path: GUIDE, anchor: 'tests-that-copy-a-constant' },
      ...counterpartsOf(COPIED_CONSTANT_EXCEPTION_RULE),
    ],
  });
}

function copyPastedTestEntry(): RuleEntry {
  return ruleEntry({
    ...JVM,
    tool: 'pmd',
    rule: COPY_PASTED_TEST_RULE,
    summary:
      'Three or more test methods (or Kotest cases) of one class whose bodies are the same once string, number, character, boolean and null literals are ignored.',
    why: 'A copy per case hides which value is the case and makes a new case a copy-paste. A table has one row per case and one body to read. Nitpicker computes it over the test sources of every module and prints it as a PMD rule, like the other test honesty rules.',
    allowed: copyPastedTestMessage({ count: 2, kotlin: false }),
    exception: { key: EXCEPTIONS_KEY, rule: COPY_PASTED_TEST_EXCEPTION_RULE },
    docs: [
      { label: GUIDE_LABEL, path: GUIDE, anchor: 'copy-pasted-tests' },
      ...counterpartsOf(COPY_PASTED_TEST_EXCEPTION_RULE),
    ],
  });
}

/** The entries of the rules nitpicker itself adds to the Java and Kotlin presets. */
export function jvmNitpickerEntries(): RuleEntry[] {
  return [
    ...archunitEntries(),
    ...springConfigEntries(),
    unrunTestEntry(),
    roundTripEntry(),
    copiedConstantEntry(),
    copyPastedTestEntry(),
    maxValueEntry(),
    nullFallThroughEntry(),
    formatEntry('google'),
    formatEntry('palantir'),
    ...suppressionEntries(),
    ...commentEntries(),
  ];
}
