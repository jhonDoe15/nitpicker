import {
  bodyOf,
  initializer,
  isLiteral,
  LANGUAGE_RULES,
  parseStructure,
} from './jvm-declarations.mjs';
import { skipNested } from './jvm-members.mjs';
import { namesOf } from './jvm-tokens.mjs';

const ANGLE_DEPTH = new Map([
  ['<', 1],
  ['>', -1],
]);
const PAREN_DEPTH = new Map([
  ['(', 1],
  [')', -1],
]);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record', 'object']);
const MEMBER_ACCESS = new Set(['.', '::']);
const STATIC_OWNERS = { java: new Set(['class', 'interface']), kotlin: new Set(['object']) };

function angleDepthChange(text) {
  return ANGLE_DEPTH.get(text) ?? 0;
}

function parameterParts(tokens, close, paren) {
  const parts = [[]];
  let depth = 0;
  for (let index = paren + 1; index < close[paren]; index += 1) {
    const { text } = tokens[index];
    depth += angleDepthChange(text);
    if (text === ',' && depth === 0) {
      parts.push([]);
      continue;
    }
    const end = skipNested(close, index);
    parts.at(-1).push(...tokens.slice(index, end + 1));
    index = end;
  }
  return parts.filter((part) => part.length > 0);
}

function parameterType(part, kotlin) {
  if (kotlin) {
    const colon = part.findIndex(({ text }) => text === ':');
    const assign = part.findIndex(({ text }) => text === '=');
    return part.slice(colon + 1, assign === -1 ? undefined : assign);
  }
  return withoutAnnotations(part.filter(({ text }) => text !== 'final')).slice(0, -1);
}

function annotationEnd(part, from) {
  let index = from + 2;
  while (part[index]?.text === '.') {
    index += 2;
  }
  let depth = 0;
  while (part[index]?.text === '(' || depth > 0) {
    depth += PAREN_DEPTH.get(part[index]?.text) ?? 0;
    index += 1;
    if (index >= part.length) {
      return index;
    }
  }
  return index;
}

function withoutAnnotations(part) {
  const kept = [];
  let index = 0;
  while (index < part.length) {
    if (part[index].text === '@') {
      index = annotationEnd(part, index);
    } else {
      kept.push(part[index]);
      index += 1;
    }
  }
  return kept;
}

function signature(structure, { paren }, kotlin) {
  const { tokens, close } = structure;
  if (paren === undefined || close[paren] < 0) {
    return '';
  }
  return parameterParts(tokens, close, paren)
    .map((part) =>
      parameterType(part, kotlin)
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

function usedLocally(structure, { name, member }) {
  const { tokens, header } = structure;
  return tokens.some(
    (token, index) =>
      index >= header.end &&
      (index < member.start || index >= member.end) &&
      namesOf(token).includes(name),
  );
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
    usedLocally: usedLocally(structure, found),
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

function overloadCounter(found) {
  const counts = new Map();
  const keyOf = ({ owner, name, kind }) => `${kind}\0${owner ?? ''}\0${name}`;
  for (const item of found) {
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  }
  return (item) => counts.get(keyOf(item)) > 1;
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
  const context = { overloaded: overloadCounter(found), signatures, mainTypes };
  return {
    packageName: structure.header.packageName,
    imports: structure.header.imports,
    tokens: structure.tokens,
    headerEnd: structure.header.end,
    declaredTypes: declaredTypes(structure.tokens),
    definitions: found.map((item) => definition(structure, item, context)),
  };
}
