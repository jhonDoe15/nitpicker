import { append } from '../../../kotlin-facts.mjs';

const RECEIVER_HOSTS = new Set(['apply', 'run', 'with']);
const MEMBER_NAME = /^[\p{Ll}_]/u;
const LEXICAL_ENDS = new Set(['class', 'object']);

function addName(names, name, entry) {
  append(names, name, entry);
}

function functionNames(view, scope, names) {
  const fn = view.functionOf(scope);
  for (const parameter of fn?.parameters ?? []) {
    addName(names, parameter.name, { key: `${scope.id}:${parameter.name}`, type: parameter.type });
  }
  if (fn?.receiver !== undefined) {
    addName(names, 'this', { key: `${scope.id}:this`, type: fn.receiver });
  }
}

function lambdaNames(scope, names) {
  const receiver = scope.qualifier ?? scope.argument;
  const receiving = RECEIVER_HOSTS.has(scope.host);
  const implicit = scope.k === 'lambda' && !receiving ? [{ name: 'it' }] : [];
  for (const { name, type } of scope.params ?? implicit) {
    addName(names, name, { key: `${scope.id}:${name}`, type });
  }
  if (scope.k === 'lambda' && receiving && receiver !== undefined) {
    addName(names, 'this', { key: `${scope.id}:this` });
  }
}

function classNames(view, scope, names) {
  const declared = view.classes.get(scope.qualified);
  for (const parameter of declared?.primaryParameters ?? []) {
    addName(names, parameter.name, { key: `${scope.id}:${parameter.name}`, type: parameter.type });
  }
  for (const property of view.propertiesOf(scope.qualified)) {
    addName(names, property.name, {
      key: `${scope.id}:${property.name}`,
      type: property.type,
      origin: property.origin,
    });
  }
}

function scopeNames(view, scope) {
  const names = new Map();
  if (scope.k === 'fun') {
    functionNames(view, scope, names);
  } else if (scope.k === 'class' || scope.k === 'object') {
    classNames(view, scope, names);
  } else {
    lambdaNames(scope, names);
  }
  return names;
}

function localEntry(local) {
  return {
    key: `${local.scope}:${local.name}@${local.line}`,
    type: local.type,
    origin: local.origin,
    local,
  };
}

function visible(entry, line, holder) {
  return (
    entry.local === undefined ||
    entry.local.line < line ||
    (entry.local.line === line && entry.local !== holder)
  );
}

function implicitOwner(index, { chain }) {
  const owner = chain.find(
    (scope) => index.names.get(scope.id)?.has('this') && !LEXICAL_ENDS.has(scope.k),
  );
  return owner === undefined ? undefined : `${owner.id}:this`;
}

function lookup(index, { chain, line, holder }, name) {
  for (const scope of chain) {
    const entries = index.names.get(scope.id)?.get(name) ?? [];
    const found = entries.findLast((entry) => visible(entry, line, holder));
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function classMember(index, { chain }, member) {
  const owner = chain.find(({ k }) => k === 'class');
  const entry = owner === undefined ? undefined : index.names.get(owner.id)?.get(member)?.[0];
  return entry === undefined ? undefined : { node: entry.key };
}

function resolveName(index, where, read) {
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

function buildIndex(view) {
  const names = new Map(view.file.scopes.map((scope) => [scope.id, scopeNames(view, scope)]));
  for (const local of view.file.locals) {
    const scoped = names.get(local.scope);
    if (scoped !== undefined) {
      addName(scoped, local.name, localEntry(local));
    }
  }
  const functionScopes = new Map(
    view.file.scopes
      .filter(({ k }) => k === 'fun')
      .map((scope) => [`${scope.name}:${String(scope.line)}`, scope]),
  );
  const index = { names, functionScopes };
  index.resolve = (read, scopeId, place) =>
    read.lambda === undefined
      ? resolveName(index, { chain: view.chain(scopeId), ...place }, read)
      : { node: `r:${String(read.lambda)}` };
  index.declaration = (scopeId, name, place) =>
    lookup(index, { chain: view.chain(scopeId), ...place }, name);
  index.functionScope = (fn) => functionScopes.get(`${fn.name}:${String(fn.line)}`);
  index.localKey = (local) => localEntry(local).key;
  return index;
}

export function bindingIndex(view) {
  return view.memo('bindingIndex', () => buildIndex(view));
}
