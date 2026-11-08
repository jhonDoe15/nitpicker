import { ancestorsOf } from '../../kotlin-facts.mjs';

const TYPE_NAME = /[\p{L}_][\p{L}\p{N}_]*(?:\s*\.\s*[\p{L}_][\p{L}\p{N}_]*)*/gu;
const VARIANCE = new Set(['out', 'in']);
const FUNCTION_TYPE = /->/u;

function qualifiedOf(file, klass) {
  return file.package === '' ? klass.qualified : `${file.package}.${klass.qualified}`;
}

export function kotlinClasses(files) {
  const entries = files
    .filter(({ test }) => !test)
    .flatMap((file) =>
      file.classes
        .filter(({ local }) => !local)
        .map((klass) => [
          qualifiedOf(file, klass),
          { klass, file, qualified: qualifiedOf(file, klass) },
        ]),
    );
  return new Map(entries.toReversed());
}

function baseCandidates(first, file, owner) {
  const prefix = file.package === '' ? '' : `${file.package}.`;
  const nested = ancestorsOf(owner)
    .toReversed()
    .flatMap((scope) =>
      scope.split('.').at(-1) === first ? [`${prefix}${scope}`] : [`${prefix}${scope}.${first}`],
    );
  const imported = file.imports
    .filter(({ all, alias, path }) => !all && (alias ?? path.split('.').at(-1)) === first)
    .map(({ path }) => path);
  if (imported.length > 0) {
    return [...nested, ...imported];
  }
  const starred = file.imports.filter(({ all }) => all).map(({ path }) => `${path}.${first}`);
  return [...nested, ...imported, `${prefix}${first}`, ...starred];
}

export function resolveKotlinClass(name, { classes, file, owner }) {
  const parts = name.replaceAll(/\s+/gu, '').split('.');
  if (parts.length > 1 && classes.has(parts.join('.'))) {
    return parts.join('.');
  }
  const rest = parts.slice(1);
  return baseCandidates(parts[0], file, owner)
    .map((base) => [base, ...rest].join('.'))
    .find((qualified) => classes.has(qualified));
}

export function kotlinTypeReferences(type) {
  if (type === undefined || type === null || FUNCTION_TYPE.test(type)) {
    return [];
  }
  const references = [];
  let depth = 0;
  let index = 0;
  for (const match of type.matchAll(TYPE_NAME)) {
    for (const character of type.slice(index, match.index)) {
      depth += character === '<' ? 1 : 0;
      depth -= character === '>' ? 1 : 0;
    }
    index = match.index + match[0].length;
    if (!VARIANCE.has(match[0])) {
      references.push({ name: match[0], many: depth > 0 });
    }
  }
  return references;
}
