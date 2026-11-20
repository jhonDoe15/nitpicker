import { standingOf, wordCount, type Source } from '../source/java-source.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import type { Forwarder } from './forwarder-parse.mts';

export type Call = { readonly at: number; readonly qualifierAt: number | undefined };
export type Site = {
  readonly forwarder: Forwarder;
  readonly source: Source;
  readonly at: number;
};
export type Verdict = Call | string | undefined;

const CONTEXT = 200;
const STATEMENT_WORDS = new Set(['return', 'throw', 'else', 'case', 'yield', 'assert', 'do']);
const QUALIFIER = /(?<![\w.$])([A-Za-z_]\w*)\s*\.\s*$/u;

function ownerFqn({ source, owner }: Forwarder): string {
  return source.packageName === '' ? owner.name : `${source.packageName}.${owner.name}`;
}

function ownerResolves(forwarder: Forwarder, source: Source): boolean {
  if (source.path === forwarder.source.path) {
    return true;
  }
  const standing = standingOf(source, forwarder.owner.name, ownerFqn(forwarder));
  return (
    standing === 'same' ||
    (standing === 'free' && source.packageName === forwarder.source.packageName)
  );
}

function staticImports(forwarder: Forwarder, source: Source): boolean {
  const owner = ownerFqn(forwarder);
  return source.imports.some(
    (line) =>
      line.isStatic &&
      (line.wildcard ? line.fqn === owner : line.fqn === `${owner}.${forwarder.method.name}`),
  );
}

function declaredType(code: string, name: string): string | undefined {
  const declaration = new RegExp(
    String.raw`(?<![\w.$])([A-Za-z_][\w.]*)(?:<[^;(){}=]*>)?(?:\[\])*\s+${escapeRegExp(name)}\b\s*(?=[=;,):])`,
    'gu',
  );
  return [...code.matchAll(declaration)]
    .map((found) => found[1] ?? '')
    .find((type) => !STATEMENT_WORDS.has(type));
}

function inOwner({ forwarder, source, at }: Site): boolean {
  const { owner } = forwarder;
  return source.path === forwarder.source.path && owner.open < at && at < owner.close;
}

function qualifiedCall(site: Site, from: number): Verdict {
  const { forwarder, source, at } = site;
  const context = source.code.slice(from, at);
  const qualifier = QUALIFIER.exec(context);
  const name = qualifier?.[1];
  if (qualifier !== null && name === forwarder.owner.name && ownerResolves(forwarder, source)) {
    return { at, qualifierAt: from + qualifier.index };
  }
  const known = name === undefined ? undefined : declaredType(source.code, name);
  const elsewhere =
    /["']\s*\.\s*$/u.test(context) ||
    /^[A-Z]/u.test(name ?? '') ||
    (known !== undefined && known !== forwarder.owner.name);
  const samePackage = source.packageName === forwarder.source.packageName;
  const mentionsOwner = wordCount(source.code, forwarder.owner.name) > 0;
  return elsewhere || !samePackage || !mentionsOwner
    ? undefined
    : `${source.path} calls ${forwarder.method.name} on a value that may be a ${forwarder.owner.name}`;
}

function methodReference(site: Site, context: string): Verdict {
  const { forwarder, source } = site;
  const owner = new RegExp(String.raw`\b${escapeRegExp(forwarder.owner.name)}\s*::\s*$`, 'u');
  return inOwner(site) || owner.test(context)
    ? `${source.path} uses ${forwarder.method.name} as a method reference`
    : undefined;
}

function unqualifiedCall(site: Site, context: string): Verdict {
  const { forwarder, source, at } = site;
  const { name } = forwarder.method;
  const previous = /([A-Za-z_]\w*|[>\]])\s*$/u.exec(context)?.[1];
  if (previous !== undefined && !STATEMENT_WORDS.has(previous)) {
    return inOwner(site)
      ? `${source.path} declares another ${name} inside ${forwarder.owner.name}`
      : undefined;
  }
  if (inOwner(site)) {
    return { at, qualifierAt: undefined };
  }
  return staticImports(forwarder, source) ? `${source.path} imports ${name} statically` : undefined;
}

export function classify(site: Site): Verdict {
  const { forwarder, source, at } = site;
  const from = Math.max(0, at - CONTEXT);
  const context = source.code.slice(from, at);
  if (/::\s*$/u.test(context)) {
    return methodReference(site, context);
  }
  if (!/^\s*\(/u.test(source.code.slice(at + forwarder.method.name.length))) {
    return undefined;
  }
  return /\.\s*$/u.test(context) ? qualifiedCall(site, from) : unqualifiedCall(site, context);
}
