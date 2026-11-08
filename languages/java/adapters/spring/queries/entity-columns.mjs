import { pathInside, readJavaSource, sourceFilesUnder } from '../../review-rules/java-sources.mjs';

const PERSISTENT_CLASS =
  /@(?:[\w.]*\.)?(?:Entity|Embeddable|MappedSuperclass)\b(?:\s*\([^()]*\))?[^{;]*?\bclass\s+([A-Za-z_$][\w$]*)/gu;
const ANNOTATION_ARGUMENTS = /@[\w.]+\s*\([^()]*\)/gu;
const ANNOTATION = /@[\w.]+/gu;
const TRANSIENT_ANNOTATION = /@(?:[\w.]*\.)?Transient\b/u;
const SKIPPED_FIELD = /\b(?:static|transient)\b/u;
const FIELD = /([A-Za-z_$][\w$.]*)(?:\s*<[^]*>)?(?:\s*\[\s*\])*\s+([A-Za-z_$][\w$]*)$/u;
const GETTER = /\b((?:get|is)\p{Lu}[\w$]*)\s*\(\s*\)/gu;

function closingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += text[index] === '{' ? 1 : 0;
    depth -= text[index] === '}' ? 1 : 0;
    if (depth === 0) {
      return index;
    }
  }
  return text.length;
}

function memberText(body) {
  let depth = 0;
  let kept = '';
  for (const character of body) {
    depth -= character === '}' ? 1 : 0;
    kept += depth === 0 ? character : ' ';
    depth += character === '{' ? 1 : 0;
  }
  return kept;
}

function withoutAnnotations(text) {
  let previous;
  let current = text;
  while (previous !== current) {
    previous = current;
    current = current.replaceAll(ANNOTATION_ARGUMENTS, ' ');
  }
  return current.replaceAll(ANNOTATION, ' ');
}

function field(declaration) {
  if (TRANSIENT_ANNOTATION.test(declaration)) {
    return undefined;
  }
  const [head] = withoutAnnotations(declaration).split('=');
  const plain = head.trim();
  if (plain === '' || plain.includes('(') || plain.includes('{') || SKIPPED_FIELD.test(plain)) {
    return undefined;
  }
  const match = FIELD.exec(plain);
  return match === null ? undefined : [match[2], match[1].split('.').at(-1)];
}

function classesIn(text) {
  return [...text.matchAll(PERSISTENT_CLASS)].map((match) => {
    const open = text.indexOf('{', match.index + match[0].length);
    const body = open < 0 ? '' : text.slice(open + 1, closingBrace(text, open));
    const members = memberText(body);
    return {
      name: match[1],
      fields: new Map(
        members
          .split(/[;}]/u)
          .map((declaration) => field(declaration))
          .filter((entry) => entry !== undefined),
      ),
      getters: [...members.matchAll(GETTER)].map((getter) => getter[1]),
    };
  });
}

export function propertyNames(getter) {
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

export function entityColumns(projectRoot, roots) {
  const classes = new Map();
  for (const root of new Set(roots)) {
    for (const file of sourceFilesUnder(pathInside(projectRoot, root), ['.java'])) {
      for (const declared of classesIn(readJavaSource(file) ?? '')) {
        classes.set(declared.name, declared);
      }
    }
  }
  const computed = computedGetters([...classes.values()]);
  return {
    readsColumns: (getters) =>
      getters.every((getter) => !computed.has(getter)) &&
      [...classes.values()].some((declared) => walks(classes, declared, getters)),
    isColumnOf: (type, getter) =>
      !computed.has(getter) && walks(classes, classes.get(type.split('.').at(-1)), [getter]),
  };
}
