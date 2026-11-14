import {
  blankBlockBodies,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../../review-rules/java-sources.mjs';
import { bodyClosing } from '../proxies/java-declarations.mjs';

const PERSISTENT_CLASS =
  /@(?:[\w.]*\.)?(?:Entity|Embeddable|MappedSuperclass)\b(?:\s*\([^()]*\))?[^{;]*?\bclass\s+([A-Za-z_$][\w$]*)/gu;
const ANNOTATION_ARGUMENTS = /@[\w.]+\s*\([^()]*\)/gu;
const ANNOTATION = /@[\w.]+/gu;
const TRANSIENT_ANNOTATION = /@(?:[\w.]*\.)?Transient\b/u;
const SKIPPED_FIELD = /\b(?:static|transient)\b/u;
const FIELD = /([A-Za-z_$][\w$.]*)(?:\s*\[\s*\])*\s+([A-Za-z_$][\w$]*)$/u;
const GENERICS = /<[^<>]*>/gu;
const GETTER = /\b((?:get|is)\p{Lu}[\w$]*)\s*\(\s*\)/gu;

function withoutNested(text, pattern, replacement) {
  const depth = text.split('').filter((character) => character === '(' || character === '<');
  return [...depth, ''].reduce((current) => current.replaceAll(pattern, replacement), text);
}

function withoutAnnotations(text) {
  return withoutNested(text, ANNOTATION_ARGUMENTS, ' ').replaceAll(ANNOTATION, ' ');
}

function withoutGenerics(text) {
  return withoutNested(text, GENERICS, '');
}

function topLevelParts(text) {
  const parts = [''];
  let depth = 0;
  for (const character of text) {
    depth += '([{'.includes(character) ? 1 : 0;
    depth -= ')]}'.includes(character) ? 1 : 0;
    if (depth === 0 && character === ',') {
      parts.push('');
    } else {
      parts[parts.length - 1] += depth === 0 ? character : ' ';
    }
  }
  return parts;
}

function fields(declaration) {
  if (TRANSIENT_ANNOTATION.test(declaration)) {
    return [];
  }
  const parts = topLevelParts(withoutGenerics(withoutAnnotations(declaration))).map((part) =>
    part.split('=')[0].trim(),
  );
  const plain = parts.join(',');
  if (plain === '' || plain.includes('(') || plain.includes('{') || SKIPPED_FIELD.test(plain)) {
    return [];
  }
  const [first, ...others] = parts;
  const match = FIELD.exec(first.trim());
  if (match === null) {
    return [];
  }
  const type = match[1].split('.').at(-1);
  return [match[2], ...others.map((name) => name.trim())].map((name) => [name, type]);
}

function classesIn(text) {
  return [...text.matchAll(PERSISTENT_CLASS)].map((match) => {
    const open = text.indexOf('{', match.index + match[0].length);
    const body = open < 0 ? '' : text.slice(open + 1, bodyClosing(text, open));
    const members = blankBlockBodies(body);
    return {
      name: match[1],
      fields: new Map(members.split(/[;}]/u).flatMap((declaration) => fields(declaration))),
      getters: [...members.matchAll(GETTER)].map((getter) => getter[1]),
    };
  });
}

function propertyNames(getter) {
  const rest = getter.replace(/^(?:get|is)/u, '');
  return [`${rest.charAt(0).toLowerCase()}${rest.slice(1)}`, getter];
}

function columnType(declared, getter) {
  const name = propertyNames(getter).find((candidate) => declared.fields.has(candidate));
  return name === undefined ? undefined : declared.fields.get(name);
}

function computedGetters(classes) {
  return new Set(
    classes.flatMap((declared) =>
      declared.getters.filter((getter) => columnType(declared, getter) === undefined),
    ),
  );
}

function walks(classes, declared, getters) {
  let current = declared;
  for (const getter of getters) {
    const type = current === undefined ? undefined : columnType(current, getter);
    if (type === undefined) {
      return false;
    }
    current = classes.get(type);
  }
  return true;
}

function persistentClasses(projectRoot, roots) {
  const files = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), ['.java']),
  );
  return new Map(
    files
      .flatMap((file) => classesIn(readJavaSource(file) ?? ''))
      .map((declared) => [declared.name, declared]),
  );
}

export function entityColumns(projectRoot, roots) {
  const classes = persistentClasses(projectRoot, roots);
  const computed = computedGetters([...classes.values()]);
  return {
    readsColumns: (getters) =>
      getters.every((getter) => !computed.has(getter)) &&
      [...classes.values()].some((declared) => walks(classes, declared, getters)),
    isColumnOf: (type, getter) =>
      !computed.has(getter) && walks(classes, classes.get(type.split('.').at(-1)), [getter]),
  };
}
