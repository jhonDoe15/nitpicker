import { accumulatingSpreadCheck, accumulatingSpreadReport } from './accumulating-spread-check.mts';
import type {
  OwnedMessage,
  OwnedNativeRule,
  OxlintDiagnostic,
  RuleMessages,
  SpreadCheck,
} from '../plan/oxlint-shapes.mts';

const OWNED_NATIVE_RULES = new Map<string, OwnedNativeRule>([
  [
    'nitpicker/no-accumulating-spread',
    {
      native: 'oxc/no-accumulating-spread',
      reportOf: accumulatingSpreadReport,
      checkerOf: accumulatingSpreadCheck,
    },
  ],
]);

export function ownedNativeRuleIds(): string[] {
  return [...OWNED_NATIVE_RULES.keys()];
}

export function ownedNativePlugins(): string[] {
  return [
    ...new Set(
      [...OWNED_NATIVE_RULES.values()].map(({ native }) => native.split('/')[0] ?? native),
    ),
  ];
}

function nativeCode(nativeName: string): string {
  const [scope, rule] = nativeName.split('/');
  return `${String(scope)}(${String(rule)})`;
}

export function ownedNativeName(ruleId: string): string | undefined {
  return OWNED_NATIVE_RULES.get(ruleId)?.native;
}

export function ownedNativeMessage({
  ruleId,
  diagnostic,
  ruleMessages,
  filePath,
}: {
  readonly ruleId: string;
  readonly diagnostic: OxlintDiagnostic;
  readonly ruleMessages: RuleMessages;
  readonly filePath: string;
}): OwnedMessage | undefined {
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

export function ownedNativeChecker(
  filePath: string,
  text: string,
): (check: SpreadCheck) => boolean {
  const checkers = new Map(
    [...OWNED_NATIVE_RULES].map(([ruleId, { checkerOf }]) => [ruleId, checkerOf(filePath, text)]),
  );
  return (check) => {
    const keeps = checkers.get(check.ruleId);
    if (keeps === undefined) {
      throw new Error(`${check.ruleId} has no owned native checker`);
    }
    return keeps(check);
  };
}
