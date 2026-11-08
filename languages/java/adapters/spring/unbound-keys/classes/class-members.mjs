import { closingIndex, memberText, topLevelParts } from './source-structure.mjs';

const DECLARATION =
  /(?<![@\w.])(class|record|enum|interface|object)\s+(?!(?:class|interface)\b)([A-Za-z_]\w*)/gu;
const KOTLIN_ENUM = /\benum\s+$/u;
const ANNOTATION = /@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?/gu;
const JAVA_MODIFIERS = /^(?:(?:private|protected|public|final|transient|volatile|static)\s+)*/u;
const JAVA_TYPE = String.raw`[\w.]+(?:\s*<[\s\S]*>)?(?:\s*\[\s*\])*`;
const JAVA_FIELD = new RegExp(String.raw`^(${JAVA_TYPE})\s+(\w+)$`, 'u');
const JAVA_SETTER = /\bvoid\s+set([A-Z]\w*)\s*\(\s*(?:final\s+)?([\w.<>,?[\]\s]+?)\s+\w+\s*\)/u;
const ANY_SETTER = /\bvoid\s+set([A-Z]\w*)\s*\(/u;
const KOTLIN_MODIFIERS =
  /^(?:(?:private|protected|internal|public|override|open|final|lateinit|abstract)\s+)*/u;
const KOTLIN_PROPERTY =
  /^(?:val|var)\s+(\w+)\s*(?::\s*([^=]+?))?\s*(?:(?:=|\bby\b|\bget\b)[\s\S]*)?$/u;
const KOTLIN_PARAMETER = /^(?:(?:val|var)\s+)?(\w+)\s*:\s*([^=]+?)\s*(?:=[\s\S]*)?$/u;
const KOTLIN_HEADER_END = /\b(?:class|fun|val|var|object|interface)\b/u;

function withoutAnnotations(text) {
  return text.replaceAll(ANNOTATION, ' ').trim();
}

function skipSpace(code, index) {
  let at = index;
  while (at < code.length && /\s/u.test(code[at])) {
    at += 1;
  }
  return at;
}

function afterGenerics(code, index) {
  const at = skipSpace(code, index);
  return code[at] === '<' ? closingIndex(code, at) + 1 : at;
}

function constructorOf(code, index) {
  const at = skipSpace(code, afterGenerics(code, index));
  const keyword = /^(?:(?:private|protected|internal|public)\s+)?(?:@\w+\s+)*constructor\s*/u.exec(
    code.slice(at),
  );
  const open = keyword === null ? at : at + keyword[0].length;
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
    const supertype = /^\s*:\s*([\w.]+)\s*(?:<[^>]*>)?\s*\(/u.exec(header);
    return supertype?.[1];
  }
  return /\bextends\s+([\w.]+)/u.exec(header)?.[1];
}

function parameterMembers(parameters, kotlin) {
  return topLevelParts(parameters, [','])
    .map((part) =>
      withoutAnnotations(part.text).replace(kotlin ? KOTLIN_MODIFIERS : JAVA_MODIFIERS, ''),
    )
    .map((text) =>
      kotlin ? KOTLIN_PARAMETER.exec(text) : JAVA_FIELD.exec(text.replace(/\.\.\.$/u, '')),
    )
    .filter((match) => match !== null)
    .map((match) =>
      kotlin ? { name: match[1], type: match[2] } : { name: match[2], type: match[1] },
    );
}

function javaMember(segment, className) {
  const text = withoutAnnotations(segment);
  const setter = JAVA_SETTER.exec(text) ?? ANY_SETTER.exec(text);
  if (setter !== null) {
    return [{ name: setter[1], type: setter[2] }];
  }
  const constructor = new RegExp(
    String.raw`^(?:(?:public|protected|private)\s+)?${className}\s*\(`,
    'u',
  ).exec(text);
  if (constructor !== null) {
    const open = constructor[0].length - 1;
    return parameterMembers(text.slice(open + 1, closingIndex(text, open)), false);
  }
  const declaration = text.split('=')[0].trim();
  if (/\bstatic\b/u.test(declaration) || (text.includes('{') && !text.includes('='))) {
    return [];
  }
  const field = JAVA_FIELD.exec(declaration.replace(JAVA_MODIFIERS, ''));
  return field === null ? [] : [{ name: field[2], type: field[1] }];
}

function kotlinMember(segment) {
  const text = withoutAnnotations(segment).replace(KOTLIN_MODIFIERS, '');
  const property = KOTLIN_PROPERTY.exec(text.replace(/\{$/u, ''));
  return property === null ? [] : [{ name: property[1], type: property[2] }];
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
    KOTLIN_ENUM.test(code.slice(Math.max(0, match.index - 20), match.index))
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
      members:
        kind === 'enum' || kind === 'interface'
          ? []
          : membersOf({ body, parameters, kotlin, name }),
    };
  });
}
