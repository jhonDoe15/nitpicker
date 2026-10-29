import { BLOCKING_REPOSITORY_BASES } from './blocking-catalog.mjs';
import { resolverFor } from './type-names.mjs';

const SPRING_DATA = 'org.springframework.data.';

function lastSegment(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

function isDataBase(entry, { file, resolver }) {
  return (
    BLOCKING_REPOSITORY_BASES.includes(lastSegment(entry)) &&
    (entry.startsWith(SPRING_DATA) ||
      resolver.importsFrom(SPRING_DATA) ||
      file.imports.length === 0)
  );
}

function derivesFromData(root, byName) {
  const seen = new Set();
  const pending = [root];
  for (const current of pending) {
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (current.klass.supers.some((entry) => isDataBase(entry, current))) {
      return true;
    }
    pending.push(...current.klass.supers.flatMap((entry) => byName.get(lastSegment(entry)) ?? []));
  }
  return false;
}

function repositoryNames(files) {
  const classes = files.flatMap((file) => {
    const resolver = resolverFor(file);
    return file.classes.map((klass) => ({ klass, file, resolver }));
  });
  const byName = Map.groupBy(classes, ({ klass }) => klass.name);
  return new Set(
    classes.filter((entry) => derivesFromData(entry, byName)).map(({ klass }) => klass.name),
  );
}

export function projectIndex(files) {
  const production = files.filter(({ test }) => !test);
  const functions = production.flatMap((file) => file.functions);
  const suspending = new Set(
    functions.filter(({ modifiers }) => modifiers.includes('suspend')).map(({ name }) => name),
  );
  const plain = new Set(
    functions.filter(({ modifiers }) => !modifiers.includes('suspend')).map(({ name }) => name),
  );
  const constructors = new Set(production.flatMap((file) => file.classes.map(({ name }) => name)));
  return {
    suspending,
    plain,
    constructors,
    repositories: repositoryNames(production),
    declares: (name) => functions.some((fn) => fn.name === name),
  };
}
