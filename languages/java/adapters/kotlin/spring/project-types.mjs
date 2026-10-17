import { REPOSITORY_ROOTS } from './names/spring-types.mjs';

function qualifiedName(file, declaration) {
  const parts = [];
  for (let current = declaration; current !== undefined; current = current.parent) {
    parts.unshift(current.name);
  }
  return [file.packageName, ...parts].filter((part) => part !== '').join('.');
}

function isNewRepository(file, declaration, known) {
  return (
    declaration.kind === 'interface' &&
    !known.has(qualifiedName(file, declaration)) &&
    declaration.supertypes.some(({ type }) => file.resolver.matches(type.name, known))
  );
}

function addRepositories(files, known) {
  const found = files.flatMap((file) =>
    file.classes
      .filter((declaration) => isNewRepository(file, declaration, known))
      .map((declaration) => qualifiedName(file, declaration)),
  );
  for (const name of found) {
    known.add(name);
  }
  return found.length > 0;
}

export function repositoryTypesOf(files) {
  const known = new Set(REPOSITORY_ROOTS);
  while (addRepositories(files, known)) {
    continue;
  }
  return known;
}
