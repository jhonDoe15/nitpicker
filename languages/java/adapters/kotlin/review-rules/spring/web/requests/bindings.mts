import { grouping } from '../../../kotlin-facts.mts';
import type {
  LocalFact,
  NameRead,
  Read,
  ScopeFact,
  SpringView,
} from '../../typed/spring-shapes.mts';
import type {
  BindingIndex,
  NameEntry,
  Names,
  Resolution,
  Where,
} from '../../typed/request-types.mts';

const RECEIVER_HOSTS = new Set(['apply', 'run', 'with']);
const MEMBER_NAME = /^[\p{Ll}_]/u;
const CLASS_SCOPE = 'class';
const LEXICAL_ENDS = new Set([CLASS_SCOPE, 'object']);

function functionNames(view: SpringView, scope: ScopeFact, names: Names): void {
  const fn = view.functionOf(scope);
  for (const parameter of fn?.parameters ?? []) {
    names.append(parameter.name, {
      key: `${String(scope.id)}:${parameter.name}`,
      type: parameter.type,
    });
  }
  if (fn?.receiver !== undefined) {
    names.append('this', { key: `${String(scope.id)}:this`, type: fn.receiver });
  }
}

function lambdaNames(scope: ScopeFact, names: Names): void {
  const receiver = scope.qualifier ?? scope.argument;
  const receiving = RECEIVER_HOSTS.has(scope.host ?? '');
  const implicit = scope.k === 'lambda' && !receiving ? [{ name: 'it', type: undefined }] : [];
  for (const { name, type } of scope.params ?? implicit) {
    names.append(name, { key: `${String(scope.id)}:${name}`, type });
  }
  if (scope.k === 'lambda' && receiving && receiver !== undefined) {
    names.append('this', { key: `${String(scope.id)}:this` });
  }
}

function classNames(view: SpringView, scope: ScopeFact, names: Names): void {
  const declared = view.classes.get(scope.qualified ?? '');
  for (const parameter of declared?.primaryParameters ?? []) {
    names.append(parameter.name, {
      key: `${String(scope.id)}:${parameter.name}`,
      type: parameter.type,
    });
  }
  for (const property of view.propertiesOf(scope.qualified ?? '')) {
    names.append(property.name, {
      key: `${String(scope.id)}:${property.name}`,
      type: property.type,
      origin: property.origin,
    });
  }
}

function scopeNames(view: SpringView, scope: ScopeFact): Names {
  const names = grouping<string, NameEntry>();
  if (scope.k === 'fun') {
    functionNames(view, scope, names);
  } else if (scope.k === CLASS_SCOPE || scope.k === 'object') {
    classNames(view, scope, names);
  } else {
    lambdaNames(scope, names);
  }
  return names;
}

function localEntry(local: LocalFact): NameEntry {
  return {
    key: `${String(local.scope)}:${local.name}@${String(local.line)}`,
    type: local.type,
    origin: local.origin,
    local,
  };
}

function visible(entry: NameEntry, line: number, holder: LocalFact | undefined): boolean {
  return (
    entry.local === undefined ||
    entry.local.line < line ||
    (entry.local.line === line && entry.local !== holder)
  );
}

function implicitOwner(index: BindingIndex, { chain }: Where): string | undefined {
  const owner = chain.find(
    (scope) => index.names.get(scope.id)?.groups.has('this') && !LEXICAL_ENDS.has(scope.k),
  );
  return owner === undefined ? undefined : `${String(owner.id)}:this`;
}

function lookup(index: BindingIndex, where: Where, name: string): NameEntry | undefined {
  const { chain, line, holder } = where;
  for (const scope of chain) {
    const entries = index.names.get(scope.id)?.groups.get(name) ?? [];
    const found = entries.findLast((entry) => visible(entry, line, holder));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function classMember(
  index: BindingIndex,
  { chain }: Where,
  member: string,
): Resolution | undefined {
  const owner = chain.find(({ k }) => k === CLASS_SCOPE);
  const entry =
    owner === undefined ? undefined : index.names.get(owner.id)?.groups.get(member)?.[0];
  return entry === undefined ? undefined : { node: entry.key };
}

function resolveName(index: BindingIndex, where: Where, read: NameRead): Resolution | undefined {
  if (read.name === 'this') {
    const self = lookup(index, where, 'this');
    if (self !== undefined) {
      return { node: self.key, member: read.member };
    }
    return read.member === undefined ? undefined : classMember(index, where, read.member);
  }
  const found = lookup(index, where, read.name);
  if (found !== undefined) {
    return { node: found.key, member: read.member };
  }
  const implicit = MEMBER_NAME.test(read.name) ? implicitOwner(index, where) : undefined;
  return implicit === undefined ? undefined : { node: implicit, member: read.name, implicit: true };
}

function resolveRead(index: BindingIndex, where: Where, read: Read): Resolution | undefined {
  return read.lambda === undefined
    ? resolveName(index, where, read)
    : { node: `r:${String(read.lambda)}` };
}

function buildIndex(view: SpringView): BindingIndex {
  const names = new Map(
    view.file.scopes.map((scope): [number, Names] => [scope.id, scopeNames(view, scope)]),
  );
  for (const local of view.file.locals ?? []) {
    names.get(local.scope)?.append(local.name, localEntry(local));
  }
  const functionScopes = new Map(
    view.file.scopes
      .filter(({ k }) => k === 'fun')
      .map((scope): [string, ScopeFact] => [`${String(scope.name)}:${String(scope.line)}`, scope]),
  );
  const index: BindingIndex = {
    names,
    functionScopes,
    resolve: (read, scopeId, place) =>
      resolveRead(index, { chain: view.chain(scopeId), ...place }, read),
    declaration: (scopeId, name, place) =>
      lookup(index, { chain: view.chain(scopeId), ...place }, name),
    functionScope: (fn) => functionScopes.get(`${fn.name}:${String(fn.line)}`),
    localKey: (local) => localEntry(local).key,
  };
  return index;
}

export function bindingIndex(view: SpringView): BindingIndex {
  return view.memo(
    'bindingIndex',
    () => buildIndex(view),
    (value): value is BindingIndex =>
      typeof value === 'object' && value !== null && 'functionScopes' in value,
  );
}
