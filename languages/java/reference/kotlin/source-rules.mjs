import { entriesFrom, ruleEntry } from '../../../../shared/reference/entry.mjs';
import { CATCH_LOG_MESSAGE, CATCH_LOG_RULE } from '../../source/catch-logging.mjs';
import { KOTLIN_SOURCE_MESSAGES } from '../../adapters/kotlin/scan/kotlin-scan.mjs';
import {
  SUPPRESSION_RULE,
  TEST_ASSERTION_RULE,
} from '../../adapters/kotlin/rules/kotlin-rules.mjs';
import { TEST_ASSERTION_MESSAGE } from '../../adapters/kotlin/rules/kotlin-source-rules.mjs';

const KOTLIN = {
  page: 'kotlin-nitpicker',
  analyzers: { kotlin: ['kotlin'] },
  builds: ['gradle', 'maven'],
};
const SOURCE_GUIDE = {
  label: 'Kotlin preset guide',
  path: 'docs/kotlin-preset.md',
  anchor: 'source-checks',
};
const SCAN_GUIDE = {
  label: 'Kotlin preset guide',
  path: 'docs/kotlin-preset.md',
  anchor: 'source-scans',
};
const SOURCE_WHY =
  'A scan of the Kotlin sources on the Node side, after comments and string bodies are masked, reports it: the Kotlin counterpart of a TypeScript, Java or Python rule that narrows one spot to one allowed form.';

const SOURCE_SUMMARIES = {
  GeneratedOnHandWrittenCode:
    'A `Generated` annotation on hand-written code, which JaCoCo and PIT skip.',
  MutationIgnoreMarker: '`@DoNotMutate` or `@CoverageIgnore` on a declaration.',
  CommentedOutCode: 'Commented-out code.',
  MutableModuleState:
    'A top-level `var`, or a mutable collection, array, atomic or flow in a top-level `val`, an `object` or a companion object.',
  GenericTypeName:
    'A class, interface or object named `Util`, `Helper`, `Manager`, `Common`, `Misc` or the like.',
  GenericPackageName:
    'A package segment named `util`, `helpers`, `manager`, `common`, `misc` or the like.',
  LogStringConcatenation:
    'A log call whose message is built with a template, `+` or `format` from a runtime value.',
  ShellCommand: 'A shell and its command flag passed as arguments (`"sh", "-c"`).',
  IoCallInLoop: 'A repository, DAO, JDBC or HTTP client call inside a loop.',
  CatchOnlyLogsOrReturnsDefault:
    'A `catch` that neither throws, nor uses the exception, nor answers with an error response.',
  BooleanFlagParameter:
    'An unannotated `Boolean` parameter of a public function that is the condition of an `if`, `when` or `while`.',
  HardcodedSecret:
    'A secret-looking literal assigned to a name such as `password`, `secret`, `token` or `apiKey`.',
  CredentialLiteral:
    'A literal credential: an AWS key, a GitHub or Slack token, a private key header, a password in a URL.',
  SecretInLog: 'A secret-named value passed to a log call or `print`.',
  SqlStringBuilding: 'SQL text built from a runtime value with a template, `+` or `format`.',
  WeakHash: 'MD2, MD4, MD5 or SHA-1 for hashing or signing, or HMAC-MD5.',
  TlsVerificationOff: 'TLS certificate or host-name verification switched off.',
  HttpWithoutTimeout: 'An HTTP request or client built without a timeout.',
  UnsafeDeserialization:
    'Deserialization that instantiates attacker-chosen types (`XMLDecoder`, default typing, Kryo without registration).',
  TestHelperInSource: 'A main source that imports a test framework.',
  TestClassWithoutTestCases: 'A test-named class in the test sources without a test.',
  DetachedTestCase:
    'A test-named public function without a test annotation, in a class that has tests.',
};

const SUPPRESSION_MESSAGE =
  'Remove the suppression and fix the finding: `@Suppress` of a detekt or ktlint rule, a ruleset, `all` or one of the compiler warnings the kotlinc lint reports would hide it from the report. For generated code the routes are `exclude` and the code itself.';

const KOTLINC_ROWS = [
  [
    'deprecation',
    'A use of a deprecated API (`DEPRECATION`, `TYPEALIAS_EXPANSION_DEPRECATION`).',
    'Call the replacement the deprecation names (`ReplaceWith`, or the Java Javadoc).',
  ],
  [
    'unchecked',
    'An unchecked cast (`UNCHECKED_CAST`).',
    'Use a typed API, a checked conversion (`as? List<*>`) or a reified function.',
  ],
  ['cast', 'A useless cast (`USELESS_CAST`).', 'Remove the cast.'],
  [
    'lint-not-run',
    'The kotlinc lint could not compile the sources, for example because a compiler plugin could not be loaded.',
    'Fix the first compiler error the message names so that the lint can run.',
    {
      exception: {
        note: 'A descriptive finding: it never fails the gate, so no exception applies.',
      },
    },
  ],
];

function kotlincEntries() {
  return entriesFrom(
    {
      ...KOTLIN,
      tool: 'kotlinc',
      why: 'The kotlinc lint compiles the main Kotlin sources with the pinned compiler and reports these warnings as findings, like -Werror on the code the change touched; a build setting cannot hide them.',
      docs: [
        {
          label: 'Kotlin preset guide',
          path: 'docs/kotlin-preset.md',
          anchor: 'compiler-warnings',
        },
      ],
    },
    KOTLINC_ROWS,
  );
}

function sourceEntries() {
  return entriesFrom(
    { ...KOTLIN, tool: 'kotlin-source', why: SOURCE_WHY, docs: [SOURCE_GUIDE] },
    Object.entries(KOTLIN_SOURCE_MESSAGES).map(([rule, allowed]) => [
      rule,
      SOURCE_SUMMARIES[rule],
      allowed,
    ]),
  );
}

function scanEntries() {
  return entriesFrom(
    {
      ...KOTLIN,
      tool: 'detekt',
      why: 'A scan of the Kotlin sources on the Node side reports it under the tool detekt.',
      docs: [SCAN_GUIDE],
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

function formatEntries() {
  return [
    ruleEntry({
      ...KOTLIN,
      tool: 'ktfmt',
      rule: 'format',
      summary: 'A file is not formatted with ktfmt',
      why: 'When the project formats with ktfmt, the format check reports every file it would change.',
      allowed: 'Run ktfmt on the file; it fixes the layout.',
      exception: { key: 'exceptions', rule: 'ktfmt/format' },
      docs: [{ label: 'Kotlin preset guide', path: 'docs/kotlin-preset.md' }],
    }),
    ruleEntry({
      ...KOTLIN,
      tool: 'ktlint',
      rule: 'ktlint.<rule>',
      pattern: '^ktlint\\.',
      summary: 'A ktlint formatting rule',
      why: 'When the project formats with ktlint, the format check reports each rule of the ktlint standard ruleset that a file breaks.',
      allowed:
        'Run `ktlint --format` on the file; it fixes the layout. Not your formatter: set `kotlin.formatter` in nitpicker.config.json.',
      exception: { key: 'exceptions', rule: 'ktlint/ktlint.<rule>' },
      docs: [{ label: 'Kotlin preset guide', path: 'docs/kotlin-preset.md' }],
    }),
    ruleEntry({
      ...KOTLIN,
      tool: 'detekt',
      rule: SUPPRESSION_RULE,
      summary: 'An inline suppression of a detekt or ktlint rule',
      why: 'A `@Suppress` would hide a finding from the report, so a source scan reports every token that targets a detekt or ktlint rule.',
      allowed: SUPPRESSION_MESSAGE,
      exception: {
        note: 'No exception applies; the way out is to fix the finding, `exclude` for generated code, or the code itself.',
      },
      docs: [
        { label: 'Kotlin preset guide', path: 'docs/kotlin-preset.md', anchor: 'one-way-rules' },
      ],
    }),
  ];
}

/** The entries of the Kotlin source checks, compiler warnings and format checks. */
export function kotlinNitpickerEntries() {
  return [...sourceEntries(), ...kotlincEntries(), ...scanEntries(), ...formatEntries()];
}
