import { REPOSITORY_ROOTS } from './names/spring-types.mjs';

function qualifiedName(file, declaration) {
  const parts = [];
  for (let current = declaration; current !== undefined; current = current.parent) {
    parts.unshift(current.name);
  }
  return [file.packageName, ...parts].filter((part) => part !== '').join('.');
}

function addRepositories(files, known) {
  let added = false;
  for (const file of files) {
    for (const declaration of file.classes) {
      const name = qualifiedName(file, declaration);
      if (
        declaration.kind === 'interface' &&
        !known.has(name) &&
        declaration.supertypes.some(({ type }) => file.resolver.matches(type.name, known))
      ) {
        known.add(name);
        added = true;
      }
    }
  }
  return added;
}

export function repositoryTypesOf(files) {
  const known = new Set(REPOSITORY_ROOTS);
  while (addRepositories(files, known)) {
    continue;
  }
  return known;
}
