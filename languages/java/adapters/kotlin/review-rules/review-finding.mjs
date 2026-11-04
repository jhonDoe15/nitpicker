import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import {
  appendSentence,
  hasExceptionRoute,
} from '../../../../../shared/messages/exception-sentence.mjs';

export const REVIEW_TOOL = 'pmd';
export const SOURCE_TOOL = 'kotlin-source';

const PRINTED_TOOLS = new Set([REVIEW_TOOL, SOURCE_TOOL]);

function withRoute({ tool, rule, file, message }) {
  if (hasExceptionRoute(message)) {
    return message;
  }
  const exceptionRule = PRINTED_TOOLS.has(tool) ? `${tool}/${rule}` : rule;
  return appendSentence(message, exceptionRoute({ rule: exceptionRule, path: file }));
}

export function findingFactory() {
  const next = createIdentityCounter();
  return ({ tool = REVIEW_TOOL, rule, file, line, symbol, key, message }) => ({
    tool,
    rule,
    path: file,
    identity: next(`${rule}:${key ?? symbol}`),
    symbol,
    location: { line },
    message: withRoute({ tool, rule, file, message }),
    classification: 'enforceable',
  });
}
