import {
  GUICE_MODULES,
  KOIN_COMPONENTS,
  KTOR_APPLICATION,
  PRODUCERS,
  PRODUCING_ANNOTATIONS,
  ROOT_ANNOTATIONS,
  ROOT_SUPERTYPES,
  START_KOIN,
} from './lookup-apis.mjs';

const GENERIC_ARGUMENTS = /<.*$/u;
const LAST_SEGMENT = /\.([^.]+)$/u;
const PLAIN_NAME = /^(?:this\.)?(\w+)$/u;
const CALLED_NAME = /^([\w.]+)\s*\(/u;

export function simpleName(qualified) {
  return qualified.slice(qualified.lastIndexOf('.') + 1);
}

export function fqnsOf(file, name) {
  const bare = name.replace(GENERIC_ARGUMENTS, '').trim();
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
  return fqnsOf(file, name).some((candidate) => targets.includes(candidate));
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

export function receiverTypes(file, qualifier, typed) {
  const plain = PLAIN_NAME.exec(qualifier)?.[1];
  const names =
    plain === undefined
      ? [CALLED_NAME.exec(qualifier)?.[1]]
      : typed.filter(({ name }) => name === plain).map(({ type }) => type);
  return names
    .filter((type) => type !== undefined)
    .flatMap((type) => fqnsOf(file, type))
    .flatMap((candidate) => [candidate, PRODUCERS.get(candidate)])
    .filter((type) => type !== undefined);
}

export function isRootFile(file) {
  const topLevel = file.functions.filter(({ owner, local }) => owner === '' && !local);
  return (
    topLevel.some(({ name }) => name === 'main') ||
    topLevel.some(
      ({ receiver }) => receiver !== undefined && resolvesTo(file, receiver, [KTOR_APPLICATION]),
    ) ||
    file.classes.some(
      (klass) =>
        klass.annotations.some(({ name }) => resolvesTo(file, name, ROOT_ANNOTATIONS)) ||
        klass.supers.some((entry) => resolvesTo(file, entry, ROOT_SUPERTYPES)),
    ) ||
    (file.calls.some(({ name }) => name === START_KOIN) &&
      file.imports.some(({ path }) => path.startsWith('org.koin.') && path.includes('.context')))
  );
}

export function producesDependencies(file, annotations) {
  return annotations.some((name) => resolvesTo(file, name, PRODUCING_ANNOTATIONS));
}

function typeFrames(scopes) {
  return scopes.filter(({ k }) => k === 'class' || k === 'object');
}

export function inKoinComponent(file, scopes) {
  return typeFrames(scopes).some(({ supers = [] }) =>
    supers.some((entry) => resolvesTo(file, entry, KOIN_COMPONENTS)),
  );
}

export function moduleClassesOf(files) {
  const modules = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const file of files) {
      for (const klass of file.classes.filter(({ supers }) => supers.length > 0)) {
        const qualified = `${file.package}.${klass.qualified}`;
        const isModule = klass.supers.some((entry) =>
          fqnsOf(file, entry).some(
            (candidate) => GUICE_MODULES.includes(candidate) || modules.has(candidate),
          ),
        );
        if (isModule && !modules.has(qualified)) {
          modules.add(qualified);
          grew = true;
        }
      }
    }
  }
  return modules;
}

export function inGuiceModule(file, scopes, modules) {
  return typeFrames(scopes).some(({ supers = [] }) =>
    supers.some((entry) =>
      fqnsOf(file, entry).some(
        (candidate) => GUICE_MODULES.includes(candidate) || modules.has(candidate),
      ),
    ),
  );
}
