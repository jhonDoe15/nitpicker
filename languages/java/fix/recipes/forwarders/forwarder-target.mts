import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import { declaresType, headOf, type Source } from '../source/java-source.mts';
import { compact, type Method, type TypeBlock } from '../source/java-text.mts';
import { signatureOf, type Forwarder } from './forwarder-parse.mts';

export type Resolved = {
  readonly source: Source;
  readonly type: TypeBlock;
  readonly method: Method;
  readonly fqn: string;
  readonly publicType: boolean;
};
export type Resolution = { readonly resolved: Resolved } | { readonly declined: string };

const STATEMENT_WORDS = new Set([
  'return',
  'throw',
  'else',
  'case',
  'yield',
  'assert',
  'do',
  'new',
]);

function packageOf(fqn: string): string {
  return fqn.includes('.') ? fqn.slice(0, fqn.lastIndexOf('.')) : '';
}

function qualified(packageName: string, simple: string): string {
  return packageName === '' ? simple : `${packageName}.${simple}`;
}

function publicType(source: Source, type: TypeBlock): boolean {
  return /\bpublic\b/u.test(headOf(source, type));
}

function targetFqn(forwarder: Forwarder): string {
  const { source, qualifier, owner } = forwarder;
  if (qualifier === undefined) {
    return qualified(source.packageName, owner.name);
  }
  const imported = source.imports.find(
    (line) => !line.isStatic && !line.wildcard && line.simple === qualifier,
  );
  return imported?.fqn ?? qualified(source.packageName, qualifier);
}

function fqnOf(source: Source, name: string, sources: readonly Source[]): string | undefined {
  const imported = source.imports.find(
    (line) => !line.isStatic && !line.wildcard && line.simple === name,
  );
  if (imported !== undefined) {
    return imported.fqn;
  }
  const local =
    declaresType(source, name) ||
    sources.some(
      (other) =>
        other.packageName === source.packageName && other.types.some((type) => type.name === name),
    );
  if (local) {
    return qualified(source.packageName, name);
  }
  return source.imports.some((line) => line.wildcard && !line.isStatic)
    ? undefined
    : `java.lang.${name}`;
}

type Where = { readonly source: Source; readonly sources: readonly Source[] };

function typeNamesOf(text: string): string[] {
  return [...new Set(text.match(/\b[A-Z]\w*/gu) ?? [])];
}

function sameTypeNames(forwarder: Forwarder, method: Method, where: Where): boolean {
  const used = typeNamesOf(`${forwarder.method.returns} ${forwarder.method.parameters}`);
  const there = new Set(typeNamesOf(`${method.returns} ${method.parameters}`));
  return (
    used.every((name) => there.has(name)) &&
    used.every((name) => {
      const mine = fqnOf(forwarder.source, name, where.sources);
      return mine !== undefined && mine === fqnOf(where.source, name, where.sources);
    })
  );
}

function problemOf(forwarder: Forwarder, method: Method, where: Where): string | undefined {
  const same = where.source === forwarder.source;
  if (!method.modifiers.includes('static') || method.throws !== '') {
    return 'the target is not a static method without thrown exceptions';
  }
  if (method.modifiers.includes('private') && !same) {
    return 'the target is private';
  }
  const types = signatureOf(method.parameters)?.types.join(',');
  return compact(method.returns) === forwarder.returns &&
    types === forwarder.signature.types.join(',') &&
    sameTypeNames(forwarder, method, where)
    ? undefined
    : 'the target has another return type or parameter list';
}

function isBodiless(source: Source, target: string): boolean {
  const declaration = new RegExp(
    String.raw`([\w>\]]+)\s+${escapeRegExp(target)}\s*\([^()]*\)\s*(?:throws[^;{]*)?;`,
    'gu',
  );
  return [...source.code.matchAll(declaration)].some(
    (found) => !STATEMENT_WORDS.has(found[1] ?? ''),
  );
}

function typeOf(forwarder: Forwarder, sources: readonly Source[], fqn: string) {
  const { source: home, qualifier } = forwarder;
  const typeName = qualifier ?? forwarder.owner.name;
  if (
    qualifier !== undefined &&
    declaresType(home, qualifier) &&
    fqn !== qualified(home.packageName, qualifier)
  ) {
    return { declined: `${qualifier} is declared inside this file` };
  }
  const source = sources.find(
    (candidate) =>
      candidate.packageName === packageOf(fqn) &&
      candidate.types.some((type) => type.name === typeName),
  );
  const type = source?.types.find((candidate) => candidate.name === typeName);
  if (source === undefined || type === undefined) {
    return { declined: `${typeName} is not a class of this project` };
  }
  if (/\b(?:extends|implements|permits)\b/u.test(type.header)) {
    return {
      declined: `${typeName} has supertypes that could declare more ${forwarder.target} methods`,
    };
  }
  return { source, type };
}

export function resolveTarget(forwarder: Forwarder, sources: readonly Source[]): Resolution {
  const { qualifier, target } = forwarder;
  const fqn = targetFqn(forwarder);
  const found = typeOf(forwarder, sources, fqn);
  if ('declined' in found) {
    return { declined: found.declined };
  }
  const { source, type } = found;
  const typeName = qualifier ?? forwarder.owner.name;
  const declared = source.methods.filter((method) => method.name === target);
  const [method] = declared;
  if (
    declared.length !== 1 ||
    isBodiless(source, target) ||
    method === undefined ||
    method.depth !== 1
  ) {
    return { declined: `${typeName} does not declare exactly one ${target}` };
  }
  const problem = problemOf(forwarder, method, { source, sources });
  if (problem !== undefined) {
    return { declined: problem };
  }
  return { resolved: { source, type, method, fqn, publicType: publicType(source, type) } };
}

export function accessibleFrom(resolved: Resolved, caller: Source, offset: number): boolean {
  const { method, source, type, publicType: isPublic } = resolved;
  if (method.modifiers.includes('private')) {
    return caller.path === source.path && type.open < offset && offset < type.close;
  }
  if (caller.path === source.path || caller.packageName === source.packageName) {
    return true;
  }
  const open = method.modifiers.includes('public') || type.kind === 'interface';
  return open && isPublic;
}
