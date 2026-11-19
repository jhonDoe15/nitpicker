import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { routedEslintFields } from '../../../languages/typescript/adapters/hints/eslint-hints.mts';
import { applyRuleHints } from '../../../languages/python/rules/rule-hints.mts';
import { withRuleMessage as withRuleMessageJs } from '../../../languages/java/messages/rule-messages.mts';
import { ingestErrorProne as ingestErrorProneJs } from '../../../languages/java/ingest/errorprone/errorprone.mts';
import { withKotlinRuleMessage as withKotlinRuleMessageJs } from '../../../languages/java/adapters/kotlin/rules/kotlin-messages.mts';
import { messagesFor, ratchetedFinding } from '../../../shared/rules/file-limits.mjs';
import { exceptionHint as exceptionHintJs } from '../../../shared/rules/exceptions.mjs';
import { fieldOf, fieldsOf, textOf } from '../../../shared/values/readers.mts';
import { schemaAccepts } from './test-support/findings-schema-check.mts';
import { type ParsedFinding, parseFinding } from './test-support/parsed-findings.mts';

type Fields = Readonly<Record<string, unknown>>;
type Builder = (path: string) => Fields;
type Sample = readonly [string, string, Builder, string, string, string];

function withRuleMessage(finding: Fields): Fields {
  return fieldsOf(Reflect.apply(withRuleMessageJs, undefined, [finding]));
}
function withKotlinRuleMessage(finding: Fields): Fields {
  return fieldsOf(Reflect.apply(withKotlinRuleMessageJs, undefined, [finding]));
}
const ingestErrorProne: (text: string) => { readonly findings: readonly Fields[] } =
  ingestErrorProneJs;
const exceptionHint: (rule: string, path: string) => string = exceptionHintJs;

const identified = (finding: Fields, path = 'src/a') => ({
  tool: 'x',
  path,
  identity: 'id',
  classification: 'enforceable',
  ...finding,
});

const typescript: Builder = (path) => ({
  ...routedEslintFields({
    ruleId: 'vitest/expect-expect',
    text: 'Test has no assertions',
    relativePath: path,
    node: undefined,
    sourceFile: ts.createSourceFile('a.ts', '', ts.ScriptTarget.Latest),
  }),
  tool: 'eslint',
  rule: 'vitest/expect-expect',
});

const fileLines: Builder = (path) =>
  ratchetedFinding(
    { analyzerName: 'structure' },
    {
      rule: 'file-lines-limit',
      path,
      identity: 'file-lines',
      key: 'file-lines',
      value: 400,
      messages: messagesFor('fileLines', {
        value: 400,
        limit: 300,
        base: '{base}',
        exception: JSON.stringify({ rule: 'file-lines-limit', paths: [path], reason: '...' }),
      }),
      pathIsFolder: undefined,
      folderFiles: undefined,
    },
  );

const python: Builder = (path) =>
  applyRuleHints([
    {
      tool: 'ruff',
      rule: 'T201',
      path,
      identity: 'id',
      message: '`print` found',
      classification: 'enforceable',
    },
  ])[0] ?? {};

const java: Builder = (path) =>
  withRuleMessage({
    tool: 'pmd',
    rule: 'UnusedPrivateField',
    path,
    message: 'Avoid unused private fields such as x',
    classification: 'enforceable',
  });

const javaSpring: Builder = (path) =>
  withRuleMessage({
    tool: 'pmd',
    rule: 'SpringConstructorInjection',
    path,
    message: 'Inject through the constructor into final fields.',
    classification: 'enforceable',
  });

const javaErrorProne: Builder = (path) => {
  const diagnostic = {
    file: path,
    line: 3,
    column: 1,
    message:
      '[NullAway] returning @Nullable expression from method with @NonNull return type (line 18)',
  };
  const [finding] = ingestErrorProne(JSON.stringify([diagnostic])).findings;
  return {
    ...finding,
    message: `${textOf(fieldOf(finding, 'message'))} ${exceptionHint('errorprone/NullAway', path)}`,
  };
};

const kotlin: Builder = (path) =>
  withKotlinRuleMessage({
    tool: 'detekt',
    rule: 'detekt.potential-bugs.UnsafeCallOnNullableType',
    path,
    message: 'Calling methods on a nullable type with `!!` may throw.',
    classification: 'enforceable',
  });

const EXPECT_FORM =
  'Call `expect` in the test body: asserting helpers do not count, so return the value and `expect` it in the test.';
const SPLIT_FORM = 'Split it into files by responsibility.';
const NULL_FORM =
  "Annotate what may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable if it uses none) and check it before use; otherwise give it a non-null value.";
const LOGGING_FORM =
  'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`. For program output, take a `TextIO` parameter and write with `out.write(...)` or `print(..., file=out)`; the entry point passes `sys.stdout`.';
const NULL_SAFE_FORM =
  'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.';
const JAVA = 'src/main/java/A.java';
const KOTLIN = 'src/main/kotlin/A.kt';

const SAMPLES: readonly Sample[] = [
  ['typescript', 'src/a.test.ts', typescript, 'exceptions', 'vitest/expect-expect', EXPECT_FORM],
  ['typescript', 'src/a.ts', fileLines, 'exceptions', 'file-lines-limit', SPLIT_FORM],
  ['javascript', 'src/a.test.js', typescript, 'exceptions', 'vitest/expect-expect', EXPECT_FORM],
  ['javascript', 'src/a.js', fileLines, 'exceptions', 'file-lines-limit', SPLIT_FORM],
  ['python', 'src/a.py', python, 'python.exceptions', 'T201', LOGGING_FORM],
  ['python', 'src/a.py', fileLines, 'exceptions', 'file-lines-limit', SPLIT_FORM],
  ['java', JAVA, java, 'exceptions', 'pmd/UnusedPrivateField', 'Remove the field, or use it.'],
  ['java', JAVA, javaErrorProne, 'exceptions', 'errorprone/NullAway', NULL_FORM],
  [
    'java',
    JAVA,
    javaSpring,
    'exceptions',
    'pmd/SpringConstructorInjection',
    'Inject through the constructor into final fields.',
  ],
  [
    'kotlin',
    KOTLIN,
    kotlin,
    'exceptions',
    'detekt.potential-bugs.UnsafeCallOnNullableType',
    NULL_SAFE_FORM,
  ],
  ['kotlin', KOTLIN, fileLines, 'exceptions', 'file-lines-limit', SPLIT_FORM],
];

describe('the allowed form and the exception of a finding', () => {
  it.each(SAMPLES)(
    '%s: %s is told as fields that agree with the message',
    (_preset, path, build, list, rule, allowedForm) => {
      const finding = parseFinding(identified(build(path), path));

      expect({
        allowedForm: fieldOf(finding, 'allowedForm'),
        exception: fieldOf(finding, 'exception'),
        exceptionList: fieldOf(finding, 'exceptionList'),
      }).toEqual({
        allowedForm,
        exception: { rule, paths: [path], reason: '...' },
        exceptionList: list,
      });
      const message = textOf(fieldOf(finding, 'message'));
      expect(message.includes(allowedForm)).toBe(true);
      expect(message.endsWith(exceptionSentenceOf(finding))).toBe(true);
      expect(schemaAccepts([finding])).toBe(true);
    },
  );
});

function exceptionSentenceOf(finding: ParsedFinding): string {
  const exception = fieldOf(finding, 'exception');
  const exceptionList = textOf(fieldOf(finding, 'exceptionList'));
  return `If this is intended, add ${JSON.stringify(exception)} to "${exceptionList}" in nitpicker.config.json.`;
}
