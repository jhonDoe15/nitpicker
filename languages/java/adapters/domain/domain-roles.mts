import type { ClassEntry } from './domain-types.mts';

const DOMAIN_SEGMENT = 'domain';
const ADAPTER_SEGMENTS = new Set(['adapter', 'adapters', 'infrastructure', 'infra']);

function segments({ packageName }: Pick<ClassEntry, 'packageName'>): string[] {
  return packageName.split('.');
}

export function isAdapter(entry: Pick<ClassEntry, 'packageName'>): boolean {
  return segments(entry).some((segment) => ADAPTER_SEGMENTS.has(segment));
}

export function isDomain(entry: Pick<ClassEntry, 'packageName'>): boolean {
  return segments(entry).includes(DOMAIN_SEGMENT) && !isAdapter(entry);
}

export function libraryPackage(className: string): string {
  const outer = className.split('$')[0] ?? className;
  const index = outer.lastIndexOf('.');
  return index < 0 ? outer : outer.slice(0, index);
}

export function grouped<Entry>(
  entries: readonly Entry[],
  keyOf: (entry: Entry) => string,
): [Entry, ...Entry[]][] {
  const groups = new Map<string, [Entry, ...Entry[]]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const existing = groups.get(key);
    groups.set(key, existing === undefined ? [entry] : [...existing, entry]);
  }
  return [...groups.values()];
}
