import type { Node } from 'web-tree-sitter';
import type { AlignContext, AlignHole, AlignState, FieldInfo, Pair } from '../../extract-types.mts';
import { hasModifier } from '../class-shape.mts';
import { codeParts, field, parentOf, required, squashed } from '../syntax.mts';

function store(holes: Map<string, AlignHole>, key: string, hole: AlignHole): void {
  holes.set(key, hole);
}

export function fieldInfo(method: Node): Map<string, FieldInfo> {
  const info = new Map<string, FieldInfo>();
  const members = codeParts(parentOf(method)).filter(
    (member) => member.type === 'field_declaration' && !hasModifier(member, 'static'),
  );
  for (const member of members) {
    const type = squashed(required(member, 'type'));
    for (const declarator of codeParts(member).filter(
      ({ type: kind }) => kind === 'variable_declarator',
    )) {
      info.set(required(declarator, 'name').text, {
        type: field(declarator, 'dimensions') === undefined ? type : undefined,
        isFinal: hasModifier(member, 'final'),
      });
    }
  }
  return info;
}

export function fieldStep(
  pair: Pair,
  context: AlignContext,
  state: AlignState,
): string | undefined {
  const infos = context.fields?.map((fields) => fields.get(pair[0].text));
  const [a, b] = infos ?? [];
  if (a === undefined || b === undefined) {
    return undefined;
  }
  if (a.type === undefined || a.type !== b.type) {
    return 'the fields the copies read have different types';
  }
  if (!(a.isFinal && b.isFinal)) {
    return 'a field the copies read is not final';
  }
  const text = pair[0].text;
  const key = `field\u0000${text}`;
  const hole: AlignHole = state.holes.get(key) ?? {
    key,
    pairKey: `${text}\u0000${text}`,
    type: a.type,
    kind: 'direct',
    stem: text,
    occurrences: [],
  };
  hole.occurrences.push({ a: pair[0], b: pair[1] });
  store(state.holes, key, hole);
  return undefined;
}
