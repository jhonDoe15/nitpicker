import { roleLookup } from '../facts/reuse-modules.mjs';

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function membersByOwner(callables) {
  const members = new Map();
  for (const callable of callables) {
    if (callable.owner !== undefined) {
      members.set(callable.owner, [...(members.get(callable.owner) ?? []), callable]);
    }
  }
  return members;
}

function publishedLookup(typeById) {
  return (item) => item.published === true || typeById.get(item.owner)?.published === true;
}

export function designIndex(facts) {
  const types = facts.types ?? [];
  const callables = facts.callables ?? [];
  const roleOf = roleLookup(facts.modules);
  function isProduction(item) {
    return roleOf(item.file) !== 'test';
  }
  const typeById = byId(types);
  const callableById = byId(callables);
  const members = membersByOwner(callables);
  return {
    types: types.filter(isProduction),
    callables: callables.filter(isProduction),
    type: (id) => typeById.get(id),
    callable: (id) => callableById.get(id),
    members: (ownerId) => members.get(ownerId) ?? [],
    isProduction,
    isPublished: publishedLookup(typeById),
  };
}

export function displayName(callable, index) {
  const owner = callable.owner === undefined ? undefined : index.type(callable.owner);
  return owner === undefined || owner.kind === 'module'
    ? callable.name
    : `${owner.name}.${callable.name}`;
}

export function siteText(callable, index) {
  return `${displayName(callable, index)} (${callable.file}:${String(callable.line)})`;
}

export function listSites(sites, limit = 4) {
  const listed = sites.slice(0, limit).join(', ');
  const rest = sites.length - limit;
  return rest > 0 ? `${listed} and ${String(rest)} more` : listed;
}
