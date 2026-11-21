import { roleLookup } from '../facts/reuse-modules.mts';
import type { Facts } from '../facts/typed/fact-types.mts';
import { fieldOf, listOf } from '../../values/readers.mts';
import type { DesignCallable, DesignIndex, DesignType } from './typed/design-types.mts';

function isEntry(value: unknown): boolean {
  return (
    typeof fieldOf(value, 'id') === 'string' &&
    typeof fieldOf(value, 'file') === 'string' &&
    typeof fieldOf(value, 'name') === 'string'
  );
}

function isDesignType(value: unknown): value is DesignType {
  return isEntry(value);
}

function isDesignCallable(value: unknown): value is DesignCallable {
  return isEntry(value);
}

function byId<Item extends { readonly id: string }>(items: readonly Item[]): Map<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}

function membersByOwner(callables: readonly DesignCallable[]): Map<string, DesignCallable[]> {
  const members = new Map<string, DesignCallable[]>();
  for (const callable of callables) {
    if (callable.owner !== undefined) {
      members.set(callable.owner, [...(members.get(callable.owner) ?? []), callable]);
    }
  }
  return members;
}

function publishedLookup(typeById: ReadonlyMap<string, DesignType>): DesignIndex['isPublished'] {
  return (item) =>
    item.published === true ||
    (item.owner !== undefined && typeById.get(item.owner)?.published === true);
}

export function designIndex(facts: Facts): DesignIndex {
  const types = listOf(facts['types']).filter(isDesignType);
  const callables = listOf(facts['callables']).filter(isDesignCallable);
  const roleOf = roleLookup(facts.modules);
  function isProduction(item: { readonly file: string }): boolean {
    return roleOf(item.file) !== 'test';
  }
  const typeById = byId(types);
  const callableById = byId(callables);
  const members = membersByOwner(callables);
  return {
    types: types.filter(isProduction),
    callables: callables.filter(isProduction),
    type: (id) => (id === undefined ? undefined : typeById.get(id)),
    callable: (id) => (id === undefined ? undefined : callableById.get(id)),
    members: (ownerId) => members.get(ownerId) ?? [],
    isProduction,
    isPublished: publishedLookup(typeById),
  };
}

export function displayName(callable: DesignCallable, index: DesignIndex): string {
  const owner = callable.owner === undefined ? undefined : index.type(callable.owner);
  return owner === undefined || owner.kind === 'module'
    ? callable.name
    : `${owner.name}.${callable.name}`;
}

export function siteText(callable: DesignCallable, index: DesignIndex): string {
  return `${displayName(callable, index)} (${callable.file}:${String(callable.line)})`;
}

export function listSites(sites: readonly string[], limit = 4): string {
  const listed = sites.slice(0, limit).join(', ');
  const rest = sites.length - limit;
  return rest > 0 ? `${listed} and ${String(rest)} more` : listed;
}
