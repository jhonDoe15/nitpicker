import { roundTripPairs as untypedRoundTripPairs } from '../../../../../shared/rules/round-trips/round-trips.mjs';
import { bodyOf, LANGUAGE_RULES, parseStructure } from '../../reuse/source/jvm-declarations.mts';
import type { Language, Range, Structure } from '../../reuse/source/jvm-source-types.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';
import type { FunctionContext, MemberEntry, TripFunction, TripPair } from './trip-types.mts';

const roundTripPairs: (members: readonly TripFunction[]) => TripPair[] = untypedRoundTripPairs;

const INTERFACE = 'interface';
const KOTLIN = 'kotlin';
const PRIVATE = 'private';

function membersOf(structure: Structure, language: Language, range: Range): MemberEntry[] {
  const rules = LANGUAGE_RULES[language];
  return rules
    .members(structure.tokens, structure.close, range)
    .map((member) => ({ member, info: rules.member(structure.tokens, structure.close, member) }))
    .filter((entry): entry is MemberEntry => entry.info?.name !== undefined);
}

function isImplemented(
  structure: Structure,
  { member, info }: MemberEntry,
  language: Language,
): boolean {
  if (info.modifiers.has('abstract')) {
    return false;
  }
  if (bodyOf(structure.tokens, structure.close, member) !== undefined) {
    return true;
  }
  const after = structure.tokens.slice(info.paren ?? member.start, member.end);
  return language === KOTLIN && after.some(({ text }) => text === '=');
}

function isVisible({ info }: MemberEntry, { language, ownerKind }: FunctionContext): boolean {
  if (language === KOTLIN) {
    return !(info.modifiers.has(PRIVATE) || info.modifiers.has('protected'));
  }
  return info.modifiers.has('public') || ownerKind === INTERFACE;
}

function functionEntry(
  structure: Structure,
  { member, info }: MemberEntry,
  context: FunctionContext,
): TripFunction {
  const nameToken = structure.tokens[(info.paren ?? member.start + 1) - 1];
  const isStatic = context.language === 'java' ? info.modifiers.has('static') : context.statics;
  return { name: info.name, line: nameToken?.line ?? 0, isStatic };
}

function functionsIn(
  structure: Structure,
  entries: readonly MemberEntry[],
  context: FunctionContext,
): TripFunction[] {
  return entries
    .filter(({ info }) => info.kind === 'function' && !info.type)
    .filter(
      (entry) => isVisible(entry, context) && isImplemented(structure, entry, context.language),
    )
    .map((entry) => functionEntry(structure, entry, context));
}

function companionFunctions(structure: Structure, entries: readonly MemberEntry[]): TripFunction[] {
  return entries
    .filter(({ info }) => info.keyword === 'object' && info.modifiers.has('companion'))
    .flatMap(({ member }) => {
      const body = bodyOf(structure.tokens, structure.close, member);
      return body === undefined
        ? []
        : functionsIn(structure, membersOf(structure, KOTLIN, body), {
            language: KOTLIN,
            statics: true,
          });
    });
}

function typeFunctions(
  structure: Structure,
  { member, info }: MemberEntry,
  language: Language,
): TripFunction[] {
  const body = bodyOf(structure.tokens, structure.close, member);
  if (body === undefined || info.modifiers.has(PRIVATE)) {
    return [];
  }
  const entries = membersOf(structure, language, body);
  const ownerKind = info.keyword ?? info.kind;
  const statics = language === KOTLIN && ownerKind === 'object';
  const own = functionsIn(structure, entries, { language, ownerKind, statics });
  return [...own, ...(language === KOTLIN ? companionFunctions(structure, entries) : [])];
}

function nestedTypes(
  structure: Structure,
  { member, info }: MemberEntry,
  language: Language,
): MemberEntry[] {
  const body = bodyOf(structure.tokens, structure.close, member);
  if (body === undefined || info.modifiers.has(PRIVATE)) {
    return [];
  }
  return membersOf(structure, language, body).filter(
    (entry) => entry.info.type && !entry.info.modifiers.has('companion'),
  );
}

export function mainPairs(source: string, { kotlin }: { kotlin: boolean }): TripPair[] {
  const language = kotlin ? KOTLIN : 'java';
  const structure = parseStructure(source, { kotlin });
  const top = membersOf(structure, language, {
    from: structure.header.end,
    to: structure.tokens.length,
  });
  const fileFunctions = kotlin ? functionsIn(structure, top, { language, statics: true }) : [];
  const pairs = roundTripPairs(fileFunctions);
  const pending: { entry: MemberEntry; owner: string }[] = top
    .filter(({ info }) => info.type)
    .map((entry) => ({ entry, owner: entry.info.name }));
  for (const { entry, owner } of pending) {
    appendAll(
      pairs,
      roundTripPairs(typeFunctions(structure, entry, language)).map((pair): TripPair => ({
        ...pair,
        owner,
      })),
    );
    appendAll(
      pending,
      nestedTypes(structure, entry, language).map((inner) => ({
        entry: inner,
        owner: `${owner}.${inner.info.name}`,
      })),
    );
  }
  return pairs;
}
