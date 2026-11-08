import { pathInside, readJavaSource, sourceFilesUnder } from '../../review-rules/java-sources.mjs';

const PERSISTENT_CLASS =
  /@(?:[\w.]*\.)?(?:Entity|Embeddable|MappedSuperclass)\b(?:\s*\([^()]*\))?[^{;]*?\bclass\s+([A-Za-z_$][\w$]*)/gu;
const ANNOTATION_ARGUMENTS = /@[\w.]+\s*\([^()]*\)/gu;
const ANNOTATION = /@[\w.]+/gu;
const TRANSIENT_ANNOTATION = /@(?:[\w.]*\.)?Transient\b/u;
const SKIPPED_FIELD = /\b(?:static|transient)\b/u;
const FIELD_NAME = /([A-Za-z_$][\w$]*)$/u;

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

function fieldName(declaration) {
  if (TRANSIENT_ANNOTATION.test(declaration)) {
    return undefined;
  }
  const [head] = withoutAnnotations(declaration).split('=');
  const plain = head.trim();
  if (plain === '' || plain.includes('(') || plain.includes('{') || SKIPPED_FIELD.test(plain)) {
    return undefined;
  }
  return FIELD_NAME.exec(plain)?.[1];
}

function classesIn(text) {
  return [...text.matchAll(PERSISTENT_CLASS)].map((match) => {
    const open = text.indexOf('{', match.index + match[0].length);
    const body = open < 0 ? '' : text.slice(open + 1, closingBrace(text, open));
    const members = memberText(body);
    return {
      name: match[1],
      fields: new Set(
        members
          .split(/[;}]/u)
          .map((declaration) => fieldName(declaration))
          .filter((name) => name !== undefined),
      ),
    };
  });
}

export function propertyNames(getter) {
  const rest = getter.replace(/^(?:get|is)/u, '');
  return [`${rest.charAt(0).toLowerCase()}${rest.slice(1)}`, getter];
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
  const columns = new Set([...classes.values()].flatMap(({ fields }) => [...fields]));
  return {
    isColumn: (getter) => propertyNames(getter).some((name) => columns.has(name)),
    isColumnOf: (type, getter) => {
      const declared = classes.get(type.split('.').at(-1));
      return (
        declared !== undefined && propertyNames(getter).some((name) => declared.fields.has(name))
      );
    },
  };
}
