import { adviceOf, asSentence, entriesFrom, guideCell, ruleEntry } from '../typed/entry-views.mts';
import type { EntryRow, RuleEntry } from '../typed/entry-views.mts';
import { CATCH_LOG_MESSAGE, CATCH_LOG_RULE } from '../../source/catch-logging.mts';
import { KOTLIN_SOURCE_MESSAGES } from '../../adapters/kotlin/scan/kotlin-scan.mts';
import {
  SUPPRESSION_RULE,
  TEST_ASSERTION_RULE,
} from '../../adapters/kotlin/rules/kotlin-rules.mts';
import { TEST_ASSERTION_MESSAGE } from '../../adapters/kotlin/rules/kotlin-source-rules.mts';
import { KOTLINC_ADVICE, lintNotRun } from '../../adapters/kotlin/rules/kotlin-compiler.mts';
import { inlineSuppressionMessage } from '../../adapters/kotlin/rules/kotlin-suppressions.mts';
import { kotlinFormatAdvice } from '../../adapters/kotlin/style/kotlin-format-advice.mts';
import { ktfmtMessage, ktlintAdvice } from '../../adapters/reporting/kotlin-reports.mts';
import { JVM_BUILDS } from '../catalog-rules.mts';
import {
  BLOCKING_RULE,
  blockingMessage,
} from '../../adapters/kotlin/review-rules/blocking/blocking-findings.mts';
import {
  TIMEOUT_RULE,
  timeoutMessage,
} from '../../adapters/kotlin/review-rules/blocking/timeouts.mts';

const kotlinSourceMessages: Record<string, string> = KOTLIN_SOURCE_MESSAGES;
const kotlincAdvice: Record<string, string> = KOTLINC_ADVICE;
const lintNotRunOf: (
  output: string,
  kind: string | undefined,
) => { rule: string; message: string } = lintNotRun;
const suppressionMessage: (file: string, token: string) => { message: string } =
  inlineSuppressionMessage;
const formatAdviceOf: (tools: {
  ktfmtEditorconfig: boolean;
  editorconfigIgnored: boolean;
}) => unknown = kotlinFormatAdvice;
const ktfmtText: (advice: unknown) => string = ktfmtMessage;
const ktlintText: (advice: unknown, rule: string) => string = ktlintAdvice;

const GUIDE = 'docs/kotlin-preset.md';
const KOTLIN = {
  page: 'kotlin-nitpicker',
  analyzers: { kotlin: ['kotlin'] },
  builds: JVM_BUILDS,
};
const SOURCE_WHY =
  'A scan of the Kotlin sources on the Node side, after comments and string bodies are masked, reports it: the Kotlin counterpart of a TypeScript, Java or Python rule that narrows one spot to one allowed form.';
const KTLINT_RULES_URL = 'https://pinterest.github.io/ktlint/latest/rules/standard/';
const FORMAT_ADVICE = formatAdviceOf({ ktfmtEditorconfig: false, editorconfigIgnored: false });
const DESCRIPTIVE = 'A descriptive finding: it never fails the gate, so no exception applies.';

function kotlincEntries(): RuleEntry[] {
  return [
    ...entriesFrom(
      {
        ...KOTLIN,
        tool: 'kotlinc',
        why: 'The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.',
        docs: [{ label: 'Kotlin preset guide', path: GUIDE, anchor: 'compiler-warnings' }],
      },
      Object.entries(kotlincAdvice).map(([rule, allowed]): EntryRow => [
        rule,
        `A Kotlin compiler warning: ${guideCell(GUIDE, rule, 'kotlin diagnostics')}.`,
        allowed,
      ]),
    ),
    ruleEntry({
      ...KOTLIN,
      tool: 'kotlinc',
      rule: lintNotRunOf('', undefined).rule,
      summary:
        'The kotlinc lint could not compile the sources, for example because a compiler plugin could not be loaded.',
      why: 'Without the lint compile, the compiler warnings above are not checked, so the run says so.',
      allowed: adviceOf(lintNotRunOf('', undefined).message),
      exception: { note: DESCRIPTIVE },
      docs: [{ label: 'Kotlin preset guide', path: GUIDE, anchor: 'compiler-warnings' }],
    }),
  ];
}

function sourceEntries(): RuleEntry[] {
  return entriesFrom(
    {
      ...KOTLIN,
      tool: 'kotlin-source',
      why: SOURCE_WHY,
      docs: [{ label: 'Kotlin preset guide', path: GUIDE, anchor: 'source-checks' }],
    },
    [
      ...Object.entries(kotlinSourceMessages),
      [BLOCKING_RULE, blockingMessage('<call>', '<what blocks>', '<function>')],
      [TIMEOUT_RULE, timeoutMessage('withTimeout', '<call>')],
    ].map(([rule = '', allowed]): EntryRow => [
      rule,
      asSentence(guideCell(GUIDE, rule, 'flags')),
      allowed,
    ]),
  );
}

function scanEntries(): RuleEntry[] {
  return entriesFrom(
    {
      ...KOTLIN,
      tool: 'detekt',
      why: 'A scan of the Kotlin sources on the Node side reports it under the tool detekt.',
      docs: [{ label: 'Kotlin preset guide', path: GUIDE, anchor: 'source-scans' }],
      exceptionRule: (rule) => rule,
    },
    [
      [
        CATCH_LOG_RULE,
        'A `catch` block that logs a failure without passing the caught exception to the logger.',
        CATCH_LOG_MESSAGE,
      ],
      [TEST_ASSERTION_RULE, 'A test method that calls no assertion.', TEST_ASSERTION_MESSAGE],
    ],
  );
}

function suppressionEntry(): RuleEntry {
  return ruleEntry({
    ...KOTLIN,
    tool: 'detekt',
    rule: SUPPRESSION_RULE,
    summary:
      'An inline `@Suppress` of a detekt or ktlint rule, a ruleset, `all` or a compiler warning the kotlinc lint reports.',
    why: 'A `@Suppress` would hide a finding from the report, so a source scan reports every token that targets one.',
    forms: [
      {
        label: 'detekt.<ruleset>',
        message: adviceOf(suppressionMessage('<path>', 'detekt.style').message),
      },
      {
        label: 'UNCHECKED_CAST',
        message: adviceOf(suppressionMessage('<path>', 'UNCHECKED_CAST').message),
      },
    ],
    exception: {
      note: 'No exception applies: the routes are to fix the code, and `exclude` for generated code.',
    },
    docs: [{ label: 'Kotlin preset guide', path: GUIDE, anchor: 'one-way-rules' }],
  });
}

function formatEntries(): RuleEntry[] {
  return [
    ruleEntry({
      ...KOTLIN,
      tool: 'ktfmt',
      rule: 'format',
      summary: 'A Kotlin file is not formatted with ktfmt.',
      why: 'When the project formats with ktfmt, the format check reports every file it would change.',
      allowed: asSentence(ktfmtText(FORMAT_ADVICE)),
      exception: {
        note: 'No exception applies: format the file, or choose another formatter with `kotlin.formatter`.',
      },
      docs: [{ label: 'Kotlin preset guide', path: GUIDE }],
    }),
    ruleEntry({
      ...KOTLIN,
      tool: 'ktlint',
      rule: 'ktlint.<rule>',
      pattern: '^ktlint\\.',
      samples: ['ktlint/ktlint.standard:no-wildcard-imports'],
      summary: 'A rule of the ktlint standard ruleset that a Kotlin file breaks.',
      why: 'When the project formats with ktlint, the format check reports each rule of the ktlint standard ruleset that a file breaks.',
      links: [{ label: 'ktlint standard rules', url: KTLINT_RULES_URL }],
      exception: {
        note: `No exception applies. ${asSentence(ktlintText(FORMAT_ADVICE, 'standard:<rule>'))}`,
      },
      docs: [{ label: 'Kotlin preset guide', path: GUIDE }],
    }),
    suppressionEntry(),
  ];
}

export function kotlinNitpickerEntries(): RuleEntry[] {
  return [...sourceEntries(), ...kotlincEntries(), ...scanEntries(), ...formatEntries()];
}
