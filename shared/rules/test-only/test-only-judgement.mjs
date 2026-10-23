import { MESSAGES, renderMessage } from '../../policy.mjs';
import { UNUSED_API_RULE_IDS } from '../../unused-api/unused-api-policy.mjs';
import { exceptionText } from '../exceptions.mjs';

const TEST_SUPPORT = /(?:^|\/)test-support\//u;
const RULE = UNUSED_API_RULE_IDS.testOnlyExport;

export const TYPESCRIPT_TEST_ONLY_MESSAGES = {
  files: MESSAGES.testOnlyModule,
  exports: MESSAGES.testOnlyExport,
  reexport: MESSAGES.testOnlyReexport,
};

export const NEUTRAL_TEST_ONLY_MESSAGES = {
  files: MESSAGES.testOnlyFile,
  exports: MESSAGES.testOnlyDeclaration,
  reexport: MESSAGES.testOnlyDeclaration,
};

function isJudgedTestOnly(item, { isPublished, isExcepted }) {
  return (
    !(item.category === 'files' && TEST_SUPPORT.test(item.file)) &&
    !isPublished(item.file) &&
    !isExcepted(RULE, item.file)
  );
}

function templateFor({ category, reexportedBy }, messages) {
  if (category === 'files') {
    return messages.files;
  }
  return reexportedBy === undefined ? messages.exports : messages.reexport;
}

function testOnlyFinding(item, { analyzerName, messages }) {
  const { file, category, entry, reexportedBy } = item;
  return {
    tool: analyzerName,
    rule: RULE,
    path: file,
    identity: `${category}:${entry.name}`,
    message: renderMessage(templateFor(item, messages), {
      name: entry.name,
      reexporter: reexportedBy,
      exception: exceptionText(RULE, file),
    }),
    classification: 'enforceable',
    symbol: entry.name,
    ...(Number.isInteger(entry.line) ? { location: { line: entry.line } } : {}),
  };
}

export function testOnlyFindings(items, context) {
  return items
    .filter((item) => isJudgedTestOnly(item, context))
    .map((item) => testOnlyFinding(item, context));
}
