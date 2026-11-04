import { accumulatingSpreadCheck, accumulatingSpreadReport } from './accumulating-spread-check.mjs';

const OWNED_NATIVE_RULES = new Map([
  [
    'nitpicker/no-accumulating-spread',
    {
      native: 'oxc/no-accumulating-spread',
      reportOf: accumulatingSpreadReport,
      checkerOf: accumulatingSpreadCheck,
    },
  ],
]);

export function ownedNativeRuleIds() {
  return [...OWNED_NATIVE_RULES.keys()];
}

export function ownedNativePlugins() {
  return [...new Set([...OWNED_NATIVE_RULES.values()].map(({ native }) => native.split('/')[0]))];
}

function nativeCode(nativeName) {
  const [scope, rule] = nativeName.split('/');
  return `${scope}(${rule})`;
}

export function ownedNativeName(ruleId) {
  return OWNED_NATIVE_RULES.get(ruleId)?.native;
}

export function ownedNativeMessage({ ruleId, diagnostic, ruleMessages, filePath }) {
  const owned = OWNED_NATIVE_RULES.get(ruleId);
  if (owned === undefined || diagnostic.code !== nativeCode(owned.native)) {
    return undefined;
  }
  const { messageId, check } = owned.reportOf(diagnostic, filePath);
  const message = ruleMessages[ruleId]?.[messageId];
  if (message === undefined) {
    throw new Error(`${ruleId} has no message ${messageId} for oxlint's ${diagnostic.code}`);
  }
  return { messageId, message, check: { ruleId, ...check } };
}

export function ownedNativeChecker(filePath, text) {
  const checkers = new Map(
    [...OWNED_NATIVE_RULES].map(([ruleId, { checkerOf }]) => [ruleId, checkerOf(filePath, text)]),
  );
  return (check) => checkers.get(check.ruleId)(check);
}
