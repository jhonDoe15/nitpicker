import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { definedField } from '../../../../../shared/messages/messages.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import {
  appendSentence,
  hasExceptionRoute,
} from '../../../../../shared/messages/exception-sentence.mjs';

export const REVIEW_TOOL = 'pmd';

function withRoute({ tool, rule, file, message }) {
  if (hasExceptionRoute(message)) {
    return message;
  }
  const exceptionRule = tool === REVIEW_TOOL ? `${tool}/${rule}` : rule;
  return appendSentence(message, exceptionRoute({ rule: exceptionRule, path: file }));
}

export function findingFactory() {
  const next = createIdentityCounter();
  return ({ tool = REVIEW_TOOL, rule, file, line, symbol, key, message, allowedForm }) => ({
    tool,
    rule,
    path: file,
    identity: next(`${rule}:${key ?? symbol}`),
    symbol,
    location: { line },
    message: withRoute({ tool, rule, file, message }),
    ...definedField('allowedForm', allowedForm),
    classification: 'enforceable',
  });
}
