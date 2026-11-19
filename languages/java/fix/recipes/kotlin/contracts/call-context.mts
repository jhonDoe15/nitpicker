import { withoutGroups } from '../shared/boundaries.mts';
import { headerOf, kindOfBody } from '../shared/body-kind.mts';
import { afterGroup, enclosingOpen, escapeRegExp } from '../shared/kotlin-scan.mts';

const KNOWN_SUPERTYPES = new Set([
  ...['Any', 'Exception', 'RuntimeException', 'Throwable', 'Error', 'IllegalStateException'],
  ...['IllegalArgumentException', 'Comparable', 'Runnable', 'Iterable', 'Iterator', 'Enum'],
  ...['Closeable', 'AutoCloseable', 'Callable', 'Serializable', 'Cloneable'],
]);
const FUNCTION_HEADER = /^(?:[^=]*(?<![\w.])fun\b[^=]*|\s*init\s*)$/u;

function withoutGenerics(text: string): string {
  return text.split('<').reduce((flat) => flat.replaceAll(/<[^<>]*>/gu, ''), text);
}

function supertypeNames(header: string): string[] {
  const flat = withoutGenerics(withoutGroups(header));
  const colon = flat.indexOf(':');
  if (colon === -1) {
    return [];
  }
  return flat
    .slice(colon + 1)
    .split(',')
    .flatMap((part) => /^\s*([A-Za-z_][\w.]*)/u.exec(part)?.[1] ?? []);
}

function declaredIn(code: string, name: string): boolean {
  return new RegExp(
    String.raw`(?<![\w.])(?:class|interface|object)\s+${escapeRegExp(name)}\b`,
    'u',
  ).test(code);
}

export function inheritsUnknownMembers(code: string, offset: number): boolean {
  const pending = [enclosingOpen(code, offset)];
  for (const open of pending) {
    if (open === -1) {
      continue;
    }
    const foreign = supertypeNames(headerOf(code, open)).some(
      (name) => !(KNOWN_SUPERTYPES.has(name) || declaredIn(code, name)),
    );
    if (kindOfBody(code, open) !== 'other' && foreign) {
      return true;
    }
    pending.push(enclosingOpen(code, open));
  }
  return false;
}

function statementEnd(code: string, end: number): number {
  return afterGroup(code, end, /^\s*\{/u);
}

export function standsAlone(code: string, start: number, end: number): boolean {
  const before = code.slice(code.lastIndexOf('\n', start - 1) + 1, start).trim();
  const rest = code.slice(statementEnd(code, end));
  const openStart = before === '' || before.endsWith('{') || before.endsWith(';');
  if (!(openStart && /^[ \t]*(?:;|\}|\n|$)/u.test(rest))) {
    return false;
  }
  if (!rest.replace(/^[\s;]+/u, '').startsWith('}')) {
    return true;
  }
  const open = enclosingOpen(code, start);
  return open !== -1 && FUNCTION_HEADER.test(withoutGroups(headerOf(code, open)));
}
