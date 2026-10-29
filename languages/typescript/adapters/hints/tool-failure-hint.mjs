import {
  TROUBLESHOOTING_ANCHORS,
  failureText,
} from '../../../../shared/messages/troubleshooting.mjs';

export const PEER_TOOLS = [
  '@types/node',
  '@vitest/coverage-v8',
  'jest',
  'mocha',
  'typescript',
  'vitest',
];
const MISSING_PACKAGE =
  /Cannot find (?:package|module) '((?:@[^/']+\/)?[^/']+)[^']*' imported from/u;

function failureAnchor(message) {
  const missing = MISSING_PACKAGE.exec(message)?.[1];
  return PEER_TOOLS.includes(missing)
    ? TROUBLESHOOTING_ANCHORS.missingPeer
    : TROUBLESHOOTING_ANCHORS.typescriptToolFails;
}

export function typescriptFailureText(error) {
  return failureText(error, failureAnchor(error instanceof Error ? error.message : String(error)));
}
