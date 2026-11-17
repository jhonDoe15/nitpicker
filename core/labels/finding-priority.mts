import { entryForFinding, referenceLinks } from '../../shared/reference/store.mjs';
import { isBroadGoRule } from './go-labels.mts';
import { isKind } from './taxonomy.mts';
import { fieldOf, textOf } from '../../shared/values/readers.mts';

type Located = { readonly tool?: unknown; readonly rule?: unknown };

const findEntry: (index: unknown, finding: { tool: string; rule: string }) => unknown =
  entryForFinding;
const links: () => { index(): unknown } = referenceLinks;

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

const SHARED_LINKS = links();
const BROAD_CACHE = new Map<string, boolean>();

export function primaryKind(labels: readonly string[]): string | undefined {
  return labels.find(isKind);
}

export function isBroadRule({ tool, rule }: Located): boolean {
  const toolName = textOf(tool ?? '');
  const ruleName = textOf(rule ?? '');
  const key = `${toolName}\0${ruleName}`;
  const known = BROAD_CACHE.get(key);
  if (known !== undefined) {
    return known;
  }
  const entry = findEntry(SHARED_LINKS.index(), { tool: toolName, rule: ruleName });
  const broad = isBroadGoRule(toolName, ruleName) || fieldOf(entry, 'tier') === 'broad';
  BROAD_CACHE.set(key, broad);
  return broad;
}

export function priorityRank(labels: readonly string[], broad = false): number {
  const kind = primaryKind(labels) ?? '';
  const rank = KIND_ORDER.indexOf(kind);
  const kindRank = rank === -1 ? KIND_ORDER.length : rank;
  const tier = kind === STYLE ? LAST : broad ? BROAD : TARGETED;
  return tier * (KIND_ORDER.length + 1) + kindRank;
}
