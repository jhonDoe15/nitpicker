import {
  bodyOf,
  initializer,
  isLiteral,
  LANGUAGE_RULES,
  parseStructure,
} from './jvm-declarations.mjs';
import { topLevelIndexes } from './jvm-members.mjs';
import { signature } from './signature/jvm-signature.mjs';
import { namesOf } from './jvm-tokens.mjs';

const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record', 'object']);
const MEMBER_ACCESS = new Set(['.', '::']);
const STATIC_OWNERS = {
  java: new Set(['class', 'interface', 'enum']),
  kotlin: new Set(['object']),
};
const COMPANION_OWNERS = new Set(['class', 'interface']);
const SUPERTYPE_MARKS = new Set(['extends', 'implements', ':']);
const NOT_DEFINED = new Set(['variable', 'fields']);
const PLATFORM_MODIFIERS = ['expect', 'actual'];

function constKind(info, { language, ownerKind }) {
  if (NOT_DEFINED.has(info.kind) || PLATFORM_MODIFIERS.some((name) => info.modifiers.has(name))) {
    return undefined;
  }
  if (info.kind !== 'field') {
    return info.kind;
  }
  const javaConstant =
    ownerKind === 'interface' || (info.modifiers.has('static') && info.modifiers.has('final'));
  return language === 'kotlin' || javaConstant ? 'const' : undefined;
}

function supertypesOf(structure, { member, body }) {
  const { tokens, close } = structure;
  const header = { from: member.start, to: body.from - 1 };
  const mark = topLevelIndexes(close, header).find((index) =>
    SUPERTYPE_MARKS.has(tokens[index].text),
  );
  return mark === undefined
    ? ''
    : tokens
        .slice(mark, header.to)
        .map(({ text }) => text)
        .join(' ');
}

function staticMembers(structure, { language, owner, ownerKind, body, supertypes }) {
  const { tokens, close } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules.members(tokens, close, body).flatMap((member) => {
    const info = rules.member(tokens, close, member);
    if (info?.name !== undefined) {
      structure.memberNames.add(info.name);
    }
    if (info === undefined || info.name === undefined || info.type) {
      return [];
    }
    const isStatic =
      language === 'kotlin' ||
      info.modifiers.has('static') ||
      (ownerKind === 'interface' && info.kind === 'field');
    const kind = constKind(info, { language, ownerKind });
    const constructor = info.kind === 'function' && info.name === owner;
    const kept = isStatic && kind !== undefined && !constructor && !info.modifiers.has('override');
    return kept ? [{ ...info, kind, owner, member, supertypes }] : [];
  });
}

function companions(structure, { name, body, supertypes }) {
  const { tokens, close } = structure;
  return LANGUAGE_RULES.kotlin.members(tokens, close, body).flatMap((member) => {
    const info = LANGUAGE_RULES.kotlin.member(tokens, close, member);
    const inner = info?.keyword === 'object' && info.modifiers.has('companion');
    const innerBody = inner ? bodyOf(tokens, close, member) : undefined;
    if (innerBody === undefined) {
      return [];
    }
    const own = supertypesOf(structure, { member, body: innerBody });
    return staticMembers(structure, {
      language: 'kotlin',
      owner: name,
      ownerKind: 'object',
      body: innerBody,
      supertypes: `${supertypes}|${own}`,
    });
  });
}

function typeMembers(structure, { info, name, body }, language) {
  const ownerKind = language === 'kotlin' ? info.keyword : info.kind;
  const supertypes = supertypesOf(structure, { member: info.member, body });
  const owner = { language, owner: name, ownerKind, body, supertypes };
  const own = STATIC_OWNERS[language].has(ownerKind) ? staticMembers(structure, owner) : [];
  const companion =
    language === 'kotlin' && COMPANION_OWNERS.has(info.keyword)
      ? companions(structure, { name, body, supertypes })
      : [];
  return [...own, ...companion];
}

function nestedTypes(structure, { name, body }, language) {
  const { tokens, close } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules.members(tokens, close, body).flatMap((member) => {
    const info = rules.member(tokens, close, member);
    const hidden = ['private', 'companion'].some((modifier) => info?.modifiers?.has(modifier));
    return info?.type && info.name !== undefined && !hidden
      ? [{ info: { ...info, member }, name: `${name}.${info.name}` }]
      : [];
  });
}

function typeTree(structure, info, { language, member }) {
  const found = [];
  const pending = [{ info: { ...info, member }, name: info.name }];
  for (const type of pending) {
    const body = bodyOf(structure.tokens, structure.close, type.info.member);
    if (body !== undefined) {
      found.push(...typeMembers(structure, { ...type, body }, language));
      pending.push(
        ...(structure.nested ? nestedTypes(structure, { ...type, body }, language) : []),
      );
    }
  }
  return found;
}

function topLevel(structure, language) {
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
      return [{ ...info, member }, ...typeTree(structure, info, { language, member })];
    }
    const kind = constKind(info, { language });
    return language === 'kotlin' && kind !== undefined ? [{ ...info, kind, member }] : [];
  });
}

function namePositions({ tokens, header }) {
  const positions = new Map();
  for (const [index, token] of tokens.entries()) {
    for (const name of index < header.end ? [] : namesOf(token)) {
      const found = positions.get(name) ?? [];
      found.push(index);
      positions.set(name, found);
    }
  }
  return positions;
}

function usedLocally(positions, { name, member }) {
  return (positions.get(name) ?? []).some((index) => index < member.start || index >= member.end);
}

function qualifierOf(found, overloaded, signatures) {
  const base = found.owner === undefined ? found.name : `${found.owner}.${found.name}`;
  const qualified = overloaded ? `${base}(${signatures.get(found)})` : base;
  return qualified === found.name ? undefined : qualified;
}

function definition(structure, found, context) {
  const { tokens } = structure;
  const { start, end } = found.member;
  const texts = tokens.slice(start, end).map(({ text }) => text);
  const exportName = found.owner === undefined ? found.name : `${found.owner}.${found.name}`;
  const exported = !found.modifiers.has('private');
  const qualifier = qualifierOf(found, context.overloaded(found), context.signatures);
  return {
    name: found.name,
    kind: found.kind,
    line: tokens[start].line,
    lines: tokens[end - 1].line - tokens[start].line + 1,
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

function isEntry(found, mainTypes) {
  return found.type ? mainTypes.has(found.name) : found.name === 'main';
}

function overloadKey({ owner, name, kind }) {
  return `${kind}\0${owner ?? ''}\0${name}`;
}

function overloadCounter(found) {
  const counts = new Map();
  for (const item of found) {
    counts.set(overloadKey(item), (counts.get(overloadKey(item)) ?? 0) + 1);
  }
  return (item) => counts.get(overloadKey(item)) > 1;
}

function declaredTypes(tokens) {
  return new Set(
    tokens.flatMap((token, index) =>
      TYPE_KEYWORDS.has(token.text) &&
      !MEMBER_ACCESS.has(tokens[index - 1]?.text) &&
      tokens[index + 1]?.kind === 'identifier'
        ? [tokens[index + 1].text]
        : [],
    ),
  );
}

export function readJvmDefinitions(source, { kotlin = false, nested = false } = {}) {
  const language = kotlin ? 'kotlin' : 'java';
  const structure = { ...parseStructure(source, { kotlin }), memberNames: new Set(), nested };
  const found = topLevel(structure, language);
  const signatures = new Map(found.map((item) => [item, signature(structure, item, kotlin)]));
  const mainTypes = new Set(
    found
      .filter(({ name, owner }) => name === 'main' && owner !== undefined)
      .map(({ owner }) => owner),
  );
  const context = {
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
