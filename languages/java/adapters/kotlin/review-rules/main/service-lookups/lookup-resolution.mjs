import { KOIN_COMPONENTS, producedType } from './lookup-apis.mjs';

const GENERIC_ARGUMENTS = /<.*$/u;
const LAST_SEGMENT = /\.([^.]+)$/u;
const PLAIN_NAME = /^(?:this\.)?(\w+)$/u;
const MEMBER_PATH = /^[\w.]+\.(\w+)$/u;
const CALLED_NAME = /^([\w.]+)\s*(?:<[^(]*>\s*)?\(/u;

export function simpleName(qualified) {
  return qualified.slice(qualified.lastIndexOf('.') + 1);
}

function aliasedType(file, name) {
  const bare = name.replace(GENERIC_ARGUMENTS, '').trim();
  return (file.typeAliases ?? []).find((alias) => alias.name === bare)?.target ?? bare;
}

export function fqnsOf(file, name) {
  const bare = aliasedType(file, name).replace(GENERIC_ARGUMENTS, '').trim();
  const [root, ...rest] = bare.split('.');
  const suffix = rest.length === 0 ? '' : `.${rest.join('.')}`;
  const named = file.imports.filter(
    ({ path, alias, all }) =>
      !all && (alias === undefined ? LAST_SEGMENT.exec(path)?.[1] === root : alias === root),
  );
  const importedFrom = new Set(named.map(({ path }) => path));
  return [
    ...importedFrom,
    ...file.imports.filter(({ all }) => all).map(({ path }) => `${path}.${root}`),
    `${file.package}.${root}`,
    root,
    bare,
  ].map((candidate) => (candidate === bare ? candidate : `${candidate}${suffix}`));
}

export function resolvesTo(file, name, targets) {
  return name !== undefined && fqnsOf(file, name).some((candidate) => targets.includes(candidate));
}

export function importedFunctions(file, name) {
  const direct = file.imports
    .filter(({ path, alias, all }) => !all && (alias ?? simpleName(path)) === name)
    .map(({ path }) => ({
      name: simpleName(path),
      owner: path.slice(0, -simpleName(path).length - 1),
    }));
  const wildcard = file.imports.filter(({ all }) => all).map(({ path }) => ({ name, owner: path }));
  return [...direct, ...wildcard];
}

function scopeIds(lookup) {
  return (lookup.scopes ?? []).map(({ id }) => id).filter((id) => id !== undefined);
}

function scopeDepth(ids, { scope }) {
  const index = scope === undefined || scope === null ? ids.length : ids.indexOf(scope);
  return index === -1 ? undefined : index;
}

function visibleTypes(file, name, lookup) {
  const ids = scopeIds(lookup);
  const visible = (file.typed ?? [])
    .filter((entry) => entry.name === name)
    .map((entry) => ({ entry, depth: scopeDepth(ids, entry) }))
    .filter(({ depth }) => depth !== undefined);
  const nearest = Math.min(...visible.map(({ depth }) => depth));
  return visible.filter(({ depth }) => depth === nearest).map(({ entry }) => entry.type);
}

function qualifierTypes(file, qualifier, lookup) {
  const plain = PLAIN_NAME.exec(qualifier)?.[1];
  if (plain !== undefined) {
    const typed = visibleTypes(file, plain, lookup);
    return typed.length > 0 || !lookup.reference ? typed : [plain];
  }
  const member = MEMBER_PATH.exec(qualifier)?.[1];
  if (member !== undefined) {
    return (file.typed ?? [])
      .filter((entry) => entry.member && entry.name === member)
      .map(({ type }) => type);
  }
  return [CALLED_NAME.exec(qualifier)?.[1]];
}

export function receiverTypes(file, lookup) {
  return qualifierTypes(file, lookup.qualifier, lookup)
    .filter((type) => type !== undefined)
    .flatMap((type) => fqnsOf(file, type))
    .flatMap((candidate) => [candidate, producedType(candidate)])
    .filter((type) => type !== undefined);
}

export function typeFrames(scopes) {
  return scopes.filter(({ k }) => k === 'class' || k === 'object');
}

export function inKoinComponent(file, scopes) {
  return typeFrames(scopes).some(({ supers = [] }) =>
    supers.some((entry) => resolvesTo(file, entry, KOIN_COMPONENTS)),
  );
}

export function extendsAny(file, supers, { roots, project }) {
  return supers.some((entry) =>
    fqnsOf(file, entry).some((candidate) => roots.includes(candidate) || project.has(candidate)),
  );
}

function newSubclasses(files, hierarchy) {
  return files.flatMap((file) =>
    file.classes
      .filter((klass) => klass.supers.length > 0 && extendsAny(file, klass.supers, hierarchy))
      .map((klass) => `${file.package}.${klass.qualified}`)
      .filter((qualified) => !hierarchy.project.has(qualified)),
  );
}

export function hierarchyOf(files, roots) {
  const hierarchy = { roots, project: new Set() };
  const rounds = [newSubclasses(files, hierarchy)];
  for (const found of rounds) {
    for (const qualified of found) {
      hierarchy.project.add(qualified);
    }
    const next = newSubclasses(files, hierarchy);
    if (next.length > 0) {
      rounds.push(next);
    }
  }
  return hierarchy;
}
