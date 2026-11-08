import { closingIndex, memberText, topLevelParts } from './source-structure.mjs';

const DECLARATION =
  /(?<![@\w.])(class|record|enum|interface|object)\s+(?!(?:class|interface)\b)([A-Za-z_]\w*)/gu;
const KOTLIN_ENUM = /\benum\s+$/u;
const ANNOTATION = /@(?:\w+:)?(?:\[[^\]]*\]|[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?)/gu;
const RENAMED = /@(?:\w+:)?(?:[\w.]*\.)?Name\s*\(/u;
const JAVA_MODIFIERS = /^(?:(?:private|protected|public|final|transient|volatile|static)\s+)*/u;
const JAVA_TYPE = String.raw`[\w.]+(?:\s*<[\s\S]*>)?(?:\s*\[\s*\])*`;
const JAVA_FIELD = new RegExp(String.raw`^(${JAVA_TYPE})\s+(\w+)$`, 'u');
const SETTER = /\bvoid\s+set([A-Z]\w*)\s*\(/u;
const KOTLIN_MODIFIERS =
  /^(?:(?:private|protected|internal|public|override|open|final|lateinit|abstract)\s+)*/u;
const KOTLIN_PROPERTY = /^(?:val|var)\s+(\w+)/u;
const KOTLIN_PARAMETER = /^(?:(?:val|var)\s+)?(\w+)/u;
const KOTLIN_TYPE_END = /\s(?:by|get)\b/u;
const CONSTRUCTOR_KEYWORD = /^[\w@\s]*?\bconstructor\b/u;
const ENUM_LOOKBACK = 20;
const KOTLIN_HEADER_END = /\b(?:class|fun|val|var|object|interface)\b/u;

function withoutAnnotations(text) {
  return text.replaceAll(ANNOTATION, ' ').trim();
}

function skipSpace(code, index) {
  const offset = code.slice(index).search(/\S/u);
  return offset < 0 ? code.length : index + offset;
}

function kotlinTyped(match, text) {
  const rest = text.slice(match[0].length).trimStart();
  if (!rest.startsWith(':')) {
    return { name: match[1], type: undefined };
  }
  return { name: match[1], type: rest.slice(1).split('=')[0].split(KOTLIN_TYPE_END)[0].trim() };
}

function afterGenerics(code, index) {
  const at = skipSpace(code, index);
  return code[at] === '<' ? closingIndex(code, at) + 1 : at;
}

function constructorOf(code, index) {
  const at = skipSpace(code, afterGenerics(code, index));
  const keyword = CONSTRUCTOR_KEYWORD.exec(code.slice(at));
  const open = keyword === null ? at : skipSpace(code, at + keyword[0].length);
  if (code[open] !== '(') {
    return { parameters: undefined, end: at };
  }
  const close = closingIndex(code, open);
  return { parameters: code.slice(open + 1, close), end: close + 1 };
}

function bodyOf(code, from, kotlin) {
  const brace = code.indexOf('{', from);
  const header = code.slice(from, brace < 0 ? code.length : brace);
  if (brace < 0 || (kotlin && KOTLIN_HEADER_END.test(header))) {
    return { header: kotlin ? header.split('\n')[0] : header, body: '' };
  }
  return { header, body: code.slice(brace + 1, closingIndex(code, brace)) };
}

function superclassOf(header, kotlin) {
  if (kotlin) {
    const supertype = /^\s*:\s*([\w.]+)(?:<[^>]*>)?\s*\(/u.exec(header);
    return supertype?.[1];
  }
  return /\bextends\s+([\w.]+)/u.exec(header)?.[1];
}

function kotlinParameter(text) {
  const match = KOTLIN_PARAMETER.exec(text);
  const member = match === null ? undefined : kotlinTyped(match, text);
  return member?.type === undefined ? [] : [member];
}

function javaParameter(text) {
  const match = JAVA_FIELD.exec(text.replace(/\.\.\.$/u, ''));
  return match === null ? [] : [{ name: match[2], type: match[1] }];
}

function parameterMembers(parameters, kotlin) {
  return topLevelParts(parameters, [','])
    .map((part) =>
      withoutAnnotations(part.text).replace(kotlin ? KOTLIN_MODIFIERS : JAVA_MODIFIERS, ''),
    )
    .flatMap((text) => (kotlin ? kotlinParameter(text) : javaParameter(text)));
}

function setterOf(text) {
  const setter = SETTER.exec(text);
  if (setter === null) {
    return undefined;
  }
  const open = setter.index + setter[0].length - 1;
  const parameter = text
    .slice(open + 1, closingIndex(text, open))
    .trim()
    .replace(/^final\s+/u, '');
  const nameStart = parameter.search(/\s\w+$/u);
  return {
    name: setter[1],
    type: nameStart < 0 ? undefined : parameter.slice(0, nameStart).trim(),
  };
}

function javaMember(segment, className) {
  const text = withoutAnnotations(segment);
  const setter = setterOf(text);
  if (setter !== undefined) {
    return [setter];
  }
  const constructor = new RegExp(
    String.raw`^(?:(?:public|protected|private)\s+)?${className}\s*\(`,
    'u',
  ).exec(text);
  if (constructor !== null) {
    const open = constructor[0].length - 1;
    return parameterMembers(text.slice(open + 1, closingIndex(text, open)), false);
  }
  const [declaration, ...others] = topLevelParts(text, [',']).map((part) =>
    part.text.split('=')[0].trim(),
  );
  if (/\bstatic\b/u.test(declaration) || (text.includes('{') && !text.includes('='))) {
    return [];
  }
  const field = JAVA_FIELD.exec(declaration.replace(JAVA_MODIFIERS, ''));
  return field === null
    ? []
    : [field[2], ...others.filter((name) => /^\w+$/u.test(name))].map((name) => ({
        name,
        type: field[1],
      }));
}

function kotlinMember(segment) {
  const text = withoutAnnotations(segment).replace(KOTLIN_MODIFIERS, '').replace(/\{\}$/u, '');
  const property = KOTLIN_PROPERTY.exec(text);
  return property === null ? [] : [kotlinTyped(property, text)];
}

function membersOf({ body, parameters, kotlin, name }) {
  const separators = kotlin ? ['\n', ';'] : [';'];
  const fromBody = topLevelParts(memberText(body), separators, { angles: false }).flatMap((part) =>
    kotlin ? kotlinMember(part.text) : javaMember(part.text, name),
  );
  return [...(parameters === undefined ? [] : parameterMembers(parameters, kotlin)), ...fromBody];
}

function declarationKind(code, match) {
  const kind = match[1];
  return kind === 'class' &&
    KOTLIN_ENUM.test(code.slice(Math.max(0, match.index - ENUM_LOOKBACK), match.index))
    ? 'enum'
    : kind;
}

export function classesIn({ code, kotlin }) {
  return [...code.matchAll(DECLARATION)].map((match) => {
    const name = match[2];
    const kind = declarationKind(code, match);
    const constructor = constructorOf(code, match.index + match[0].length);
    const { header, body } = bodyOf(code, constructor.end, kotlin);
    const parameters = kind === 'record' || kotlin ? constructor.parameters : undefined;
    return {
      name,
      kind,
      offset: match.index,
      superclass: superclassOf(header, kotlin),
      renamed: RENAMED.test(`${parameters ?? ''} ${memberText(body)}`),
      members:
        kind === 'enum' || kind === 'interface'
          ? []
          : membersOf({ body, parameters, kotlin, name }),
    };
  });
}
