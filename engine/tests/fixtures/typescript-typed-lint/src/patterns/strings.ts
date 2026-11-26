const SPECIAL = /[.*+?^${}()|[\]\\]/g;

declare function escapeRegExp(value: string): string;

export function hasText(text: string, pattern: string) {
  return text.match(pattern);
}

export function findAll(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)];
}

export function build(term: string, other: string) {
  const safe = new RegExp(`^${escapeRegExp(term)}$`);
  const plain = new RegExp(other.replace(SPECIAL, '\\$&'));
  return [new RegExp(`^${term}$`), safe, plain, new RegExp('^' + other + '$')];
}

export function fromSource(source: RegExp, term: string) {
  return new RegExp(`${source.source}|${term}`);
}

export function fill(text: string, name: string, make: () => string) {
  const a = text.replace('{name}', name);
  const b = text.replaceAll('{name}', make);
  const c = text.replace('{name}', name.replace(/\$/g, '$$$$'));
  const d = !name.includes('$') ? text.replace('{name}', name) : text;
  return [a, b, c, d, text.replace('{count}', String(name.length))];
}
