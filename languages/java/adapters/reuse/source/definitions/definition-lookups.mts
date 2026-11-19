import { textAt } from '../jvm-members.mts';
import { namesOf } from '../jvm-tokens.mts';
import type { Token } from '../../jvm-reuse-types.mts';
import type { FoundMember, Structure } from '../jvm-source-types.mts';

const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record', 'object']);
const MEMBER_ACCESS = new Set(['.', '::']);

export function namePositions({ tokens, header }: Structure): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (const [index, token] of tokens.entries()) {
    for (const name of index < header.end ? [] : namesOf(token)) {
      const found = positions.get(name) ?? [];
      found.push(index);
      positions.set(name, found);
    }
  }
  return positions;
}

export function usedLocally(
  positions: ReadonlyMap<string, number[]>,
  { name, member }: FoundMember,
): boolean {
  return (positions.get(name) ?? []).some((index) => index < member.start || index >= member.end);
}

export function isEntry(found: FoundMember, mainTypes: ReadonlySet<string>): boolean {
  return found.type ? mainTypes.has(found.name) : found.name === 'main';
}

function overloadKey({ owner, name, kind }: FoundMember): string {
  return `${kind ?? ''}\0${owner ?? ''}\0${name}`;
}

export function overloadCounter(found: readonly FoundMember[]): (item: FoundMember) => boolean {
  const counts = new Map<string, number>();
  for (const item of found) {
    counts.set(overloadKey(item), (counts.get(overloadKey(item)) ?? 0) + 1);
  }
  return (item) => (counts.get(overloadKey(item)) ?? 0) > 1;
}

export function declaredTypes(tokens: readonly Token[]): Set<string> {
  return new Set(
    tokens.flatMap((token, index) =>
      TYPE_KEYWORDS.has(token.text) &&
      !MEMBER_ACCESS.has(tokens[index - 1]?.text ?? '') &&
      tokens[index + 1]?.kind === 'identifier'
        ? [textAt(tokens, index + 1)]
        : [],
    ),
  );
}
