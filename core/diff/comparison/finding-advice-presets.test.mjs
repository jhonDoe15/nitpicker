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
    rule: 'detekt.complexity.StringLiteralDuplication',
    path,
    message: 'The String literal "x" appears 3 times.',
    classification: 'enforceable',
  });

const SAMPLES = [
  ['typescript', 'src/a.test.ts', typescript, 'exceptions'],
  ['typescript', 'src/a.ts', fileLines, 'exceptions'],
  ['javascript', 'src/a.test.js', typescript, 'exceptions'],
  ['javascript', 'src/a.js', fileLines, 'exceptions'],
  ['python', 'src/a.py', python, 'python.exceptions'],
  ['python', 'src/a.py', fileLines, 'exceptions'],
  ['java', 'src/main/java/A.java', java, 'exceptions'],
  ['java', 'src/main/java/A.java', javaErrorProne, 'exceptions'],
  ['kotlin', 'src/main/kotlin/A.kt', kotlin, 'exceptions'],
  ['kotlin', 'src/main/kotlin/A.kt', fileLines, 'exceptions'],
];

describe('the allowed form and the exception of a finding', () => {
  it.each(SAMPLES)(
    '%s: %s is told as fields that agree with the message',
    (_preset, path, build, list) => {
      const finding = parseFinding(identified(build(path), path));

      expect(finding.allowedForm).toBeTruthy();
      expect(finding.message).toContain(finding.allowedForm);
      expect(finding.exceptionList).toBe(list);
      expect(finding.exception).toMatchObject({ paths: [path], reason: '...' });
      expect(finding.message.endsWith(exceptionSentenceOf(finding))).toBe(true);
      expect(validates({ findings: [finding] })).toBe(true);
    },
  );
});

function exceptionSentenceOf({ exception, exceptionList }) {
  return `If this is intended, add ${JSON.stringify(exception)} to "${exceptionList}" in nitpicker.config.json.`;
}
