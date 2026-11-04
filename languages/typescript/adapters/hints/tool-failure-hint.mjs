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
const MISSING_PACKAGE = /Cannot find (?:package|module) '([^']+)' imported from/u;

function packageOf(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function failureAnchor(message) {
  const specifier = MISSING_PACKAGE.exec(message)?.[1];
  return specifier !== undefined && PEER_TOOLS.includes(packageOf(specifier))
    ? TROUBLESHOOTING_ANCHORS.missingPeer
    : TROUBLESHOOTING_ANCHORS.typescriptToolFails;
}

export function withTypeScriptHint(error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(failureText(error, failureAnchor(message)), { cause: error });
}
