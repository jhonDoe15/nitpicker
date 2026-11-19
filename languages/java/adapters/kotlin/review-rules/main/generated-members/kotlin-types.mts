import type { ClassFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import { ancestorsOf } from '../../kotlin-facts.mts';

export type ClassEntry = { klass: ClassFact; file: KotlinFile; qualified: string };
export type ClassIndex = Map<string, ClassEntry>;
export type TypeReference = { name: string; many: boolean };

const TYPE_NAME = /[\p{L}_][\p{L}\p{N}_]*(?:\s*\.\s*[\p{L}_][\p{L}\p{N}_]*)*/gu;
const VARIANCE = new Set(['out', 'in']);

function qualifiedOf(file: KotlinFile, klass: ClassFact): string {
  return file.package === '' ? klass.qualified : `${file.package}.${klass.qualified}`;
}

export function kotlinClasses(files: KotlinFile[]): ClassIndex {
  const entries = files
    .filter(({ test }) => !test)
    .flatMap((file) =>
      file.classes
        .filter(({ local }) => !local)
        .map((klass): [string, ClassEntry] => [
          qualifiedOf(file, klass),
          { klass, file, qualified: qualifiedOf(file, klass) },
        ]),
    );
  return new Map(entries.toReversed());
}

function baseCandidates(first: string, file: KotlinFile, owner: string): string[] {
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

export function resolveKotlinClass(
  name: string,
  { classes, file, owner }: { classes: ClassIndex; file: KotlinFile; owner: string },
): string | undefined {
  const parts = name.replaceAll(/\s+/gu, '').split('.');
  if (parts.length > 1 && classes.has(parts.join('.'))) {
    return parts.join('.');
  }
  const rest = parts.slice(1);
  return baseCandidates(parts[0] ?? '', file, owner)
    .map((base) => [base, ...rest].join('.'))
    .find((qualified) => classes.has(qualified));
}

export function kotlinTypeReferences(type: string | undefined): TypeReference[] {
  if (type === undefined || type.includes('->')) {
    return [];
  }
  const references: TypeReference[] = [];
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
