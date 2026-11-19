import type { LintMessage, LintResult } from '../plan/oxlint-shapes.mts';
import { unusedDirectiveMessage, unusedRuleIds } from '../../eslint/merge/directive-messages.mts';

type Pass = { readonly typeAware: boolean; readonly results: readonly LintResult[] };

const UNUSED_DIRECTIVE = 'Unused eslint-disable directive';

function isUnusedDirective(message: LintMessage): boolean {
  return message.ruleId === undefined && message.message.startsWith(UNUSED_DIRECTIVE);
}

function positionKey({ filePath }: LintResult, { line, column }: LintMessage): string {
  return JSON.stringify([filePath, line, column]);
}

function unusedByPosition(results: readonly LintResult[]): Map<string, LintMessage> {
  return new Map(
    results.flatMap((result) =>
      result.messages
        .filter((message) => isUnusedDirective(message))
        .map((message) => [positionKey(result, message), message] as const),
    ),
  );
}

function sharedUnused(
  message: LintMessage,
  other: LintMessage | undefined,
): LintMessage | undefined {
  if (other === undefined) {
    return undefined;
  }
  const rules = unusedRuleIds(message.message);
  const otherRules = new Set(unusedRuleIds(other.message));
  if (rules.length === 0 && otherRules.size === 0) {
    return message;
  }
  const shared = rules.filter((rule) => otherRules.has(rule));
  return shared.length === 0 ? undefined : { ...message, message: unusedDirectiveMessage(shared) };
}

export function mergedPassResults(passes: readonly Pass[]): LintResult[] {
  const typed = passes.filter(({ typeAware }) => typeAware).flatMap(({ results }) => results);
  const plain = passes.filter(({ typeAware }) => !typeAware).flatMap(({ results }) => results);
  if (typed.length === 0) {
    return plain;
  }
  const typedUnused = unusedByPosition(typed);
  function kept(result: LintResult, others: Map<string, LintMessage>): LintResult {
    return {
      ...result,
      messages: result.messages.flatMap((message) => {
        if (!isUnusedDirective(message)) {
          return [message];
        }
        const merged = sharedUnused(message, others.get(positionKey(result, message)));
        return merged === undefined ? [] : [merged];
      }),
    };
  }
  return [
    ...plain.map((result) => kept(result, typedUnused)),
    ...typed.map((result) => ({
      ...result,
      messages: result.messages.filter((message) => !isUnusedDirective(message)),
    })),
  ];
}
