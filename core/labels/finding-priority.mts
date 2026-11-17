import { perRule, referenceEntryOf } from './finding-labels.mts';
import { isBroadGoRule } from './go-labels.mts';
import { isKind } from './taxonomy.mts';
import { fieldOf } from '../../shared/values/readers.mts';

type Located = { readonly tool?: unknown; readonly rule?: unknown };

const KIND_ORDER: readonly string[] = [
  'bug',
  'security',
  'performance',
  'reliability',
  'maintainability',
  'simplification',
  'tests',
  'style',
];
const STYLE = 'style';
const TARGETED = 0;
const BROAD = 1;
const LAST = 2;

export const PRIORITY_KINDS: readonly string[] = KIND_ORDER;

export function primaryKind(labels: readonly string[]): string | undefined {
  return labels.find(isKind);
}

export type BroadRuleCheck = (finding: Located) => boolean;

export function broadRuleCheck(): BroadRuleCheck {
  return perRule(
    (toolName, ruleName) =>
      isBroadGoRule(toolName, ruleName) ||
      fieldOf(referenceEntryOf(toolName, ruleName), 'tier') === 'broad',
  );
}

function tierOf(kind: string, broad: boolean): number {
  if (kind === STYLE) {
    return LAST;
  }
  return broad ? BROAD : TARGETED;
}

export function priorityRank(labels: readonly string[], broad = false): number {
  const kind = primaryKind(labels) ?? '';
  const rank = KIND_ORDER.indexOf(kind);
  const kindRank = rank === -1 ? KIND_ORDER.length : rank;
  return tierOf(kind, broad) * (KIND_ORDER.length + 1) + kindRank;
}
