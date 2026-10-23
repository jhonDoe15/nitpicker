const DOMAIN_SEGMENT = 'domain';
const ADAPTER_SEGMENTS = new Set(['adapter', 'adapters', 'infrastructure', 'infra']);

function segments({ packageName }) {
  return packageName.split('.');
}

export function isAdapter(entry) {
  return segments(entry).some((segment) => ADAPTER_SEGMENTS.has(segment));
}

export function isDomain(entry) {
  return segments(entry).includes(DOMAIN_SEGMENT) && !isAdapter(entry);
}

export function libraryPackage(className) {
  const outer = className.split('$')[0];
  const index = outer.lastIndexOf('.');
  return index < 0 ? outer : outer.slice(0, index);
}

export function grouped(entries, keyOf) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyOf(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()];
}
