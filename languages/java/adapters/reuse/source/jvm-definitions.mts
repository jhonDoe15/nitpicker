import {
  bodyOf,
  initializer,
  isLiteral,
  LANGUAGE_RULES,
  parseStructure,
} from './jvm-declarations.mts';
import { textAt, topLevelIndexes } from './jvm-members.mts';

import { signature } from './signature/jvm-signature.mts';
import {
  declaredTypes,
  isEntry,
  namePositions,
  overloadCounter,
  usedLocally,
} from './definitions/definition-lookups.mts';
import { appendAll } from '../../../../../shared/lists/items.mjs';
import type { Definition, Parsed } from '../jvm-reuse-types.mts';
import type {
  DefinitionStructure,
  FoundMember,
  Language,
  Member,
  MemberInfo,
  Range,
  Structure,
  TypeEntry,
} from './jvm-source-types.mts';

type Context = {
  readonly overloaded: (item: FoundMember) => boolean;
  readonly signatures: ReadonlyMap<FoundMember, string>;
  readonly mainTypes: ReadonlySet<string>;
  readonly positions: ReadonlyMap<string, number[]>;
};
type Owner = {
  readonly language: Language;
  readonly owner?: string;
  readonly ownerKind: string | undefined;
  readonly body: Range;
  readonly supertypes: string;
};

const CLASS = 'class';
const INTERFACE = 'interface';
const OBJECT = 'object';
const KOTLIN = 'kotlin';
const STATIC_OWNERS = {
  java: new Set([CLASS, INTERFACE, 'enum']),
  kotlin: new Set([OBJECT]),
};
const COMPANION_OWNERS = new Set([CLASS, INTERFACE]);
const SUPERTYPE_MARKS = new Set(['extends', 'implements', ':']);
const NOT_DEFINED = new Set(['variable', 'fields']);
const PLATFORM_MODIFIERS = ['expect', 'actual'];

function constKind(
  info: MemberInfo,
  { language, ownerKind }: { language: Language; ownerKind?: string | undefined },
): string | undefined {
  if (
    NOT_DEFINED.has(info.kind ?? '') ||
    PLATFORM_MODIFIERS.some((name) => info.modifiers.has(name))
  ) {
    return undefined;
  }
  if (info.kind !== 'field') {
    return info.kind;
  }
  const javaConstant =
    ownerKind === INTERFACE || (info.modifiers.has('static') && info.modifiers.has('final'));
  return language === KOTLIN || javaConstant ? 'const' : undefined;
}

function supertypesOf(
  structure: Structure,
  { member, body }: { member: Member; body: Range },
): string {
  const { tokens, close } = structure;
  const header = { from: member.start, to: body.from - 1 };
  const mark = topLevelIndexes(close, header).find((index) =>
    SUPERTYPE_MARKS.has(textAt(tokens, index)),
  );
  return mark === undefined
    ? ''
    : tokens
        .slice(mark, header.to)
        .map(({ text }) => text)
        .join(' ');
}

function mapMembers<Item>(
  structure: DefinitionStructure,
  { body, language }: { body: Range; language: Language },
  visit: (member: Member, info: MemberInfo | undefined) => Item[],
): Item[] {
  const { tokens, close } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules
    .members(tokens, close, body)
    .flatMap((member) => visit(member, rules.member(tokens, close, member)));
}

function staticMembers(
  structure: DefinitionStructure,
  { language, owner, ownerKind, body, supertypes }: Owner,
): FoundMember[] {
  return mapMembers(structure, { body, language }, (member, info) => {
    if (info?.name !== undefined) {
      structure.memberNames.add(info.name);
    }
    if (info === undefined || info.name === undefined || info.type) {
      return [];
    }
    const isStatic =
      language === KOTLIN ||
      info.modifiers.has('static') ||
      (ownerKind === INTERFACE && info.kind === 'field');
    const kind = constKind(info, { language, ownerKind });
    const constructor = info.kind === 'function' && info.name === owner;
    const kept = isStatic && kind !== undefined && !constructor && !info.modifiers.has('override');
    return kept ? [{ ...info, name: info.name, kind, owner, member, supertypes }] : [];
  });
}

function companions(
  structure: DefinitionStructure,
  { name, body, supertypes }: { name: string; body: Range; supertypes: string },
): FoundMember[] {
  const { tokens, close } = structure;
  return LANGUAGE_RULES.kotlin.members(tokens, close, body).flatMap((member) => {
    const info = LANGUAGE_RULES.kotlin.member(tokens, close, member);
    const inner = info?.keyword === OBJECT && info.modifiers.has('companion');
    const innerBody = inner ? bodyOf(tokens, close, member) : undefined;
    if (innerBody === undefined) {
      return [];
    }
    const own = supertypesOf(structure, { member, body: innerBody });
    return staticMembers(structure, {
      language: KOTLIN,
      owner: name,
      ownerKind: OBJECT,
      body: innerBody,
      supertypes: `${supertypes}|${own}`,
    });
  });
}

function typeMembers(
  structure: DefinitionStructure,
  { info, name, body }: TypeEntry & { body: Range },
  language: Language,
): FoundMember[] {
  const ownerKind = language === KOTLIN ? info.keyword : info.kind;
  const supertypes = supertypesOf(structure, { member: info.member, body });
  const owner: Owner = { language, owner: name, ownerKind, body, supertypes };
  const own =
    ownerKind !== undefined && STATIC_OWNERS[language].has(ownerKind)
      ? staticMembers(structure, owner)
      : [];
  const companion =
    language === KOTLIN && COMPANION_OWNERS.has(info.keyword ?? '')
      ? companions(structure, { name, body, supertypes })
      : [];
  return [...own, ...companion];
}

function nestedTypes(
  structure: DefinitionStructure,
  { name, body }: { name: string; body: Range },
  language: Language,
): TypeEntry[] {
  return mapMembers(structure, { body, language }, (member, info) => {
    const hidden = ['private', 'companion'].some((modifier) => info?.modifiers.has(modifier));
    return info?.type && info.name !== undefined && !hidden
      ? [{ info: { ...info, name: info.name, member }, name: `${name}.${info.name}` }]
      : [];
  });
}

function typeTree(
  structure: DefinitionStructure,
  info: MemberInfo & { name: string },
  { language, member }: { language: Language; member: Member },
): FoundMember[] {
  const found: FoundMember[] = [];
  const pending: TypeEntry[] = [{ info: { ...info, member }, name: info.name }];
  for (const type of pending) {
    const body = bodyOf(structure.tokens, structure.close, type.info.member);
    if (body !== undefined) {
      appendAll(found, typeMembers(structure, { ...type, body }, language));
      appendAll(
        pending,
        structure.nested ? nestedTypes(structure, { ...type, body }, language) : [],
      );
    }
  }
  return found;
}

function topLevel(structure: DefinitionStructure, language: Language): FoundMember[] {
  const { tokens, close, header } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules.members(tokens, close, { from: header.end, to: tokens.length }).flatMap((member) => {
    const info = rules.member(tokens, close, member);
    if (info === undefined || info.name === undefined) {
      return [];
    }
    structure.memberNames.add(info.name);
    if (info.type && constKind(info, { language }) === undefined) {
      return [];
    }
    if (info.type) {
      const named = { ...info, name: info.name };
      return [{ ...named, member }, ...typeTree(structure, named, { language, member })];
    }
    const kind = constKind(info, { language });
    return language === KOTLIN && kind !== undefined
      ? [{ ...info, name: info.name, kind, member }]
      : [];
  });
}

function qualifierOf(
  found: FoundMember,
  overloaded: boolean,
  signatures: ReadonlyMap<FoundMember, string>,
): string | undefined {
  const base = found.owner === undefined ? found.name : `${found.owner}.${found.name}`;
  const qualified = overloaded ? `${base}(${signatures.get(found) ?? ''})` : base;
  return qualified === found.name ? undefined : qualified;
}

function definition(
  structure: DefinitionStructure,
  found: FoundMember,
  context: Context,
): Definition {
  const { tokens } = structure;
  const { start, end } = found.member;
  const texts = tokens.slice(start, end).map(({ text }) => text);
  const exportName = found.owner === undefined ? found.name : `${found.owner}.${found.name}`;
  const exported = !found.modifiers.has('private');
  const qualifier = qualifierOf(found, context.overloaded(found), context.signatures);
  return {
    name: found.name,
    kind: found.kind ?? '',
    line: tokens[start]?.line,
    lines: (tokens[end - 1]?.line ?? 0) - (tokens[start]?.line ?? 0) + 1,
    exported,
    exportNames: exported ? [exportName] : [],
    tokens: texts,
    text: texts.join(' '),
    usedLocally: usedLocally(context.positions, found),
    start,
    end,
    ...(found.owner === undefined ? {} : { owner: found.owner, supertypes: found.supertypes }),
    ...(qualifier === undefined ? {} : { qualifier }),
    ...(found.kind === 'const'
      ? { literal: isLiteral(initializer(tokens, structure.close, { from: start, to: end })) }
      : {}),
    ...(found.kind === 'function' ? { overloads: true } : {}),
    ...(isEntry(found, context.mainTypes) ? { entry: true } : {}),
  };
}

export function readJvmDefinitions(
  source: string,
  { kotlin = false, nested = false }: { kotlin?: true | false; nested?: true | false } = {},
): Parsed {
  const language = kotlin ? KOTLIN : 'java';
  const structure = {
    ...parseStructure(source, { kotlin }),
    memberNames: new Set<string>(),
    nested,
  };
  const found = topLevel(structure, language);
  const signatures = new Map(found.map((item) => [item, signature(structure, item, kotlin)]));
  const mainTypes = new Set(
    found.flatMap(({ name, owner }) => (name === 'main' && owner !== undefined ? [owner] : [])),
  );
  const context: Context = {
    overloaded: overloadCounter(found),
    signatures,
    mainTypes,
    positions: namePositions(structure),
  };
  return {
    packageName: structure.header.packageName,
    imports: structure.header.imports,
    tokens: structure.tokens,
    headerEnd: structure.header.end,
    declaredTypes: declaredTypes(structure.tokens),
    memberNames: structure.memberNames,
    definitions: found.map((item) => definition(structure, item, context)),
  };
}
