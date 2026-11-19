import { cumulativeJoins as untypedCumulativeJoins } from '../../../../../shared/lists/items.mjs';
import type { ImportFact } from './typed/kotlin-fact-types.mts';

const NULLABLE = /\?$/u;
const GENERIC_ARGUMENTS = /<.*$/u;

export type Grouping<K, V> = { groups: Map<K, V[]>; append: (key: K, value: V) => void };

export function grouping<K, V>(): Grouping<K, V> {
  const groups = new Map<K, V[]>();
  function append(key: K, value: V): void {
    const list = groups.get(key);
    if (list === undefined) {
      groups.set(key, [value]);
    } else {
      list.push(value);
    }
  }
  return { groups, append };
}

export function compactType(type: string | undefined): string {
  return (type ?? '').replaceAll(/\s+/gu, '');
}

export function bareType(type: string | undefined): string {
  return compactType(type).replace(NULLABLE, '');
}

export function simpleTypeName(type: string | undefined): string | undefined {
  return bareType(type).replace(GENERIC_ARGUMENTS, '').split('.').at(-1);
}

export function insideClass(owner: string, qualified: string): boolean {
  return owner === qualified || owner.startsWith(`${qualified}.`);
}

export function annotationNamed(
  annotations: readonly (string | { name?: string })[],
  names: ReadonlySet<string>,
): boolean {
  return annotations.some((annotation) =>
    names.has(typeof annotation === 'string' ? annotation : (annotation.name ?? '')),
  );
}

const cumulativeJoins: (text: string, separator: string) => string[] = untypedCumulativeJoins;

export function importsFrom(file: { imports: readonly ImportFact[] }, prefix: string): boolean {
  return file.imports.some(({ path: imported }) => imported.startsWith(prefix));
}

export function ancestorsOf(qualified: string): string[] {
  return cumulativeJoins(qualified, '.');
}
