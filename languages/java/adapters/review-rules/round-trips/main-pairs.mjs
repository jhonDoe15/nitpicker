import { roundTripPairs } from '../../../../../shared/rules/round-trips/round-trips.mjs';
import { bodyOf, LANGUAGE_RULES, parseStructure } from '../../reuse/source/jvm-declarations.mjs';

const INTERFACE = 'interface';

function membersOf(structure, language, range) {
  const rules = LANGUAGE_RULES[language];
  return rules
    .members(structure.tokens, structure.close, range)
    .map((member) => ({ member, info: rules.member(structure.tokens, structure.close, member) }))
    .filter(({ info }) => info?.name !== undefined);
}

function isImplemented(structure, { member, info }, language) {
  if (info.modifiers.has('abstract')) {
    return false;
  }
  if (bodyOf(structure.tokens, structure.close, member) !== undefined) {
    return true;
  }
  const after = structure.tokens.slice(info.paren ?? member.start, member.end);
  return language === 'kotlin' && after.some(({ text }) => text === '=');
}

function isVisible({ info }, { language, ownerKind }) {
  if (language === 'kotlin') {
    return !(info.modifiers.has('private') || info.modifiers.has('protected'));
  }
  return info.modifiers.has('public') || ownerKind === INTERFACE;
}

function functionEntry(structure, { member, info }, context) {
  const nameToken = structure.tokens[(info.paren ?? member.start + 1) - 1];
  const isStatic = context.language === 'java' ? info.modifiers.has('static') : context.statics;
  return { name: info.name, line: nameToken.line, isStatic };
}

function functionsIn(structure, entries, context) {
  return entries
    .filter(({ info }) => info.kind === 'function' && !info.type)
    .filter(
      (entry) => isVisible(entry, context) && isImplemented(structure, entry, context.language),
    )
    .map((entry) => functionEntry(structure, entry, context));
}

function companionFunctions(structure, entries) {
  return entries
    .filter(({ info }) => info.keyword === 'object' && info.modifiers.has('companion'))
    .flatMap(({ member }) => {
      const body = bodyOf(structure.tokens, structure.close, member);
      return body === undefined
        ? []
        : functionsIn(structure, membersOf(structure, 'kotlin', body), {
            language: 'kotlin',
            statics: true,
          });
    });
}

function typeFunctions(structure, { member, info }, language) {
  const body = bodyOf(structure.tokens, structure.close, member);
  if (body === undefined || info.modifiers.has('private')) {
    return [];
  }
  const entries = membersOf(structure, language, body);
  const ownerKind = info.keyword ?? info.kind;
  const statics = language === 'kotlin' && ownerKind === 'object';
  const own = functionsIn(structure, entries, { language, ownerKind, statics });
  return [...own, ...(language === 'kotlin' ? companionFunctions(structure, entries) : [])];
}

function nestedTypes(structure, { member, info }, language) {
  const body = bodyOf(structure.tokens, structure.close, member);
  if (body === undefined || info.modifiers.has('private')) {
    return [];
  }
  return membersOf(structure, language, body).filter(
    (entry) => entry.info.type && !entry.info.modifiers.has('companion'),
  );
}

export function mainPairs(source, { kotlin }) {
  const language = kotlin ? 'kotlin' : 'java';
  const structure = parseStructure(source, { kotlin });
  const top = membersOf(structure, language, {
    from: structure.header.end,
    to: structure.tokens.length,
  });
  const fileFunctions = kotlin ? functionsIn(structure, top, { language, statics: true }) : [];
  const pairs = roundTripPairs(fileFunctions);
  const pending = top
    .filter(({ info }) => info.type)
    .map((entry) => ({ entry, owner: entry.info.name }));
  for (const { entry, owner } of pending) {
    pairs.push(
      ...roundTripPairs(typeFunctions(structure, entry, language)).map((pair) => ({
        ...pair,
        owner,
      })),
    );
    pending.push(
      ...nestedTypes(structure, entry, language).map((inner) => ({
        entry: inner,
        owner: `${owner}.${inner.info.name}`,
      })),
    );
  }
  return pairs;
}
