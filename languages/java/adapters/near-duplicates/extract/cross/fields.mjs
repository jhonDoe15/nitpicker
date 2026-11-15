import { hasModifier } from '../class-shape.mjs';
import { codeParts, field, squashed } from '../syntax.mjs';

export function fieldInfo(method) {
  const info = new Map();
  const members = codeParts(method.parent).filter(
    (member) => member.type === 'field_declaration' && !hasModifier(member, 'static'),
  );
  for (const member of members) {
    const type = squashed(field(member, 'type'));
    for (const declarator of codeParts(member).filter(
      ({ type: kind }) => kind === 'variable_declarator',
    )) {
      info.set(field(declarator, 'name').text, {
        type: field(declarator, 'dimensions') === undefined ? type : undefined,
        isFinal: hasModifier(member, 'final'),
      });
    }
  }
  return info;
}

export function fieldStep(pair, context, state) {
  const infos = context.fields?.map((fields) => fields.get(pair[0].text));
  if (infos === undefined || infos.includes(undefined)) {
    return undefined;
  }
  const [a, b] = infos;
  if (a.type === undefined || a.type !== b.type) {
    return 'the fields the copies read have different types';
  }
  if (!(a.isFinal && b.isFinal)) {
    return 'a field the copies read is not final';
  }
  const text = pair[0].text;
  const key = `field\u0000${text}`;
  const hole = state.holes.get(key) ?? {
    key,
    pairKey: `${text}\u0000${text}`,
    type: a.type,
    kind: 'direct',
    stem: text,
    occurrences: [],
  };
  hole.occurrences.push({ a: pair[0], b: pair[1] });
  state.holes.set(key, hole);
  return undefined;
}
