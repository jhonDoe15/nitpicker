import { isKind } from './taxonomy.mts';

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

export const PRIORITY_KINDS: readonly string[] = KIND_ORDER;

export function primaryKind(labels: readonly string[]): string | undefined {
  return labels.find(isKind);
}

export function priorityRank(labels: readonly string[]): number {
  const rank = KIND_ORDER.indexOf(primaryKind(labels) ?? '');
  return rank === -1 ? KIND_ORDER.length : rank;
}
