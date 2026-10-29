import {
  bodyOf,
  initializer,
  isLiteral,
  LANGUAGE_RULES,
  parseStructure,
} from './jvm-declarations.mjs';
import { annotationsEnd, topLevelIndexes } from './jvm-members.mjs';
import { namesOf } from './jvm-tokens.mjs';

const ANGLE_DEPTH = new Map([
  ['<', 1],
  ['>', -1],
]);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record', 'object']);
const MEMBER_ACCESS = new Set(['.', '::']);
const STATIC_OWNERS = { java: new Set(['class', 'interface']), kotlin: new Set(['object']) };

function parameterRanges(tokens, close, paren) {
  const ranges = [];
  let from = paren + 1;
  let depth = 0;
  for (const index of topLevelIndexes(close, { from: paren + 1, to: close[paren] })) {
    depth += ANGLE_DEPTH.get(tokens[index].text) ?? 0;
    if (tokens[index].text === ',' && depth === 0) {
      ranges.push({ from, to: index });
      from = index + 1;
    }
  }
  return [...ranges, { from, to: close[paren] }].filter((range) => range.to > range.from);
}

function javaParameterStart(tokens, close, from) {
  const positions = [from];
  for (const index of positions) {
    if (tokens[index]?.text === 'final') {
      positions.push(index + 1);
    } else if (tokens[index]?.text === '@') {
      positions.push(annotationsEnd(tokens, close, index));
    }
  }
  return positions.at(-1);
}

function parameterType(tokens, close, { range, kotlin }) {
  const part = tokens.slice(range.from, range.to);
  if (!kotlin) {
    return tokens.slice(javaParameterStart(tokens, close, range.from), range.to - 1);
  }
  const colon = part.findIndex(({ text }) => text === ':');
  const assign = part.findIndex(({ text }) => text === '=');
  return part.slice(colon + 1, assign === -1 ? undefined : assign);
}

function signature(structure, { paren }, kotlin) {
  const { tokens, close } = structure;
  if (paren === undefined || close[paren] < 0) {
    return '';
  }
  return parameterRanges(tokens, close, paren)
    .map((range) =>
      parameterType(tokens, close, { range, kotlin })
        .map(({ text }) => text)
        .join(''),
    )
    .join(',');
}

function constKind(info, { language, ownerKind }) {
  if (info.kind !== 'field') {
    return info.kind;
  }
  const javaConstant =
    ownerKind === 'interface' || (info.modifiers.has('static') && info.modifiers.has('final'));
  return language === 'kotlin' || javaConstant ? 'const' : undefined;
}

function staticMembers(structure, { language, owner, ownerKind, body }) {
  const { tokens, close } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules.members(tokens, close, body).flatMap((member) => {
    const info = rules.member(tokens, close, member);
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
    return kept ? [{ ...info, kind, owner, member }] : [];
  });
}

function companions(structure, { name, body }) {
  const { tokens, close } = structure;
  return LANGUAGE_RULES.kotlin.members(tokens, close, body).flatMap((member) => {
    const info = LANGUAGE_RULES.kotlin.member(tokens, close, member);
    const inner = info?.keyword === 'object' && info.modifiers.has('companion');
    const innerBody = inner ? bodyOf(tokens, close, member) : undefined;
    return innerBody === undefined
      ? []
      : staticMembers(structure, {
          language: 'kotlin',
          owner: name,
          ownerKind: 'object',
          body: innerBody,
        });
  });
}

function typeMembers(structure, info, { language, member }) {
  const body = bodyOf(structure.tokens, structure.close, member);
  if (body === undefined) {
    return [];
  }
  const ownerKind = language === 'kotlin' ? info.keyword : info.kind;
  const own = STATIC_OWNERS[language].has(ownerKind)
    ? staticMembers(structure, { language, owner: info.name, ownerKind, body })
    : [];
  const companion =
    language === 'kotlin' && info.keyword === 'class'
      ? companions(structure, { name: info.name, body })
      : [];
  return [...own, ...companion];
}

function topLevel(structure, language) {
  const { tokens, close, header } = structure;
  const rules = LANGUAGE_RULES[language];
  return rules.members(tokens, close, { from: header.end, to: tokens.length }).flatMap((member) => {
    const info = rules.member(tokens, close, member);
    if (info === undefined || info.name === undefined) {
      return [];
    }
    if (info.type) {
      return [{ ...info, member }, ...typeMembers(structure, info, { language, member })];
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
    ...(found.owner === undefined ? {} : { owner: found.owner }),
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

export function readJvmDefinitions(source, { kotlin = false } = {}) {
  const language = kotlin ? 'kotlin' : 'java';
  const structure = parseStructure(source, { kotlin });
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
    definitions: found.map((item) => definition(structure, item, context)),
  };
}
