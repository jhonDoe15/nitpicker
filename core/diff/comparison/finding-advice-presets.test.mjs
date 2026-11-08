import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { routedEslintFields } from '../../../languages/typescript/adapters/hints/eslint-hints.mjs';
import { applyRuleHints } from '../../../languages/python/rules/rule-hints.mjs';
import { withRuleMessage } from '../../../languages/java/messages/rule-messages.mjs';
import { ingestErrorProne } from '../../../languages/java/ingest/errorprone/errorprone.mjs';
import { withKotlinRuleMessage } from '../../../languages/java/adapters/kotlin/rules/kotlin-messages.mjs';
import { messagesFor, ratchetedFinding } from '../../../shared/rules/file-limits.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { parseFinding } from './finding-schema.mjs';

const schema = JSON.parse(
  readFileSync(
    path.resolve(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../../spec/findings.schema.json',
    ),
    'utf8',
  ),
);
const validates = new Ajv2020({ strict: false }).compile(schema);

const identified = (finding, path = 'src/a') => ({
  tool: 'x',
  path,
  identity: 'id',
  classification: 'enforceable',
  ...finding,
});

const typescript = (path) => ({
  ...routedEslintFields({
    ruleId: 'vitest/expect-expect',
    text: 'Test has no assertions',
    relativePath: path,
  }),
  tool: 'eslint',
  rule: 'vitest/expect-expect',
});

const fileLines = (path) =>
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
    },
  );

const python = (path) =>
  applyRuleHints([
    { tool: 'ruff', rule: 'T201', path, message: '`print` found', classification: 'enforceable' },
  ])[0];

const java = (path) =>
  withRuleMessage({
    tool: 'pmd',
    rule: 'UnusedPrivateField',
    path,
    message: 'Avoid unused private fields such as x',
    classification: 'enforceable',
  });

const javaSpring = (path) =>
  withRuleMessage({
    tool: 'pmd',
    rule: 'SpringConstructorInjection',
    path,
    message: 'Inject through the constructor into final fields.',
    classification: 'enforceable',
  });

const javaErrorProne = (path) => {
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
    message: `${finding.message} ${exceptionHint('errorprone/NullAway', path)}`,
  };
};

const kotlin = (path) =>
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
  'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.';
const NULL_SAFE_FORM =
  'Handle null with `value ?: return`, `value?.let { ... }`, or `checkNotNull(value) { "why" }` when null is a bug.';
const JAVA = 'src/main/java/A.java';
const KOTLIN = 'src/main/kotlin/A.kt';

const SAMPLES = [
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
        allowedForm: finding.allowedForm,
        exception: finding.exception,
        exceptionList: finding.exceptionList,
      }).toEqual({
        allowedForm,
        exception: { rule, paths: [path], reason: '...' },
        exceptionList: list,
      });
      expect(finding.message.includes(allowedForm)).toBe(true);
      expect(finding.message.endsWith(exceptionSentenceOf(finding))).toBe(true);
      expect(validates({ findings: [finding] })).toBe(true);
    },
  );
});

function exceptionSentenceOf({ exception, exceptionList }) {
  return `If this is intended, add ${JSON.stringify(exception)} to "${exceptionList}" in nitpicker.config.json.`;
}
