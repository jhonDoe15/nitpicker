import { createIdentityCounter } from '../../../ingest/common.mjs';

export const REVIEW_TOOL = 'pmd';

export function findingFactory() {
  const next = createIdentityCounter();
  return ({ tool = REVIEW_TOOL, rule, file, line, symbol, key, message }) => ({
    tool,
    rule,
    path: file,
    identity: next(`${rule}:${key ?? symbol}`),
    symbol,
    location: { line },
    message,
    classification: 'enforceable',
  });
}

export function exceptionSentence(rule) {
  return `add an exception for ${REVIEW_TOOL}/${rule} in nitpicker.config.json.`;
}
