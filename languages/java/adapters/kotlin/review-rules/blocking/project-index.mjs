import { BLOCKING_REPOSITORY_BASES } from './blocking-catalog.mjs';
import { resolverFor } from './type-names.mjs';

const SPRING_DATA = 'org.springframework.data.';

function lastSegment(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

function derivesFromData(klass, file, resolver, known) {
  return klass.supers.some((entry) => {
    const simple = lastSegment(entry);
    if (known.has(simple)) {
      return true;
    }
    return (
      BLOCKING_REPOSITORY_BASES.has(simple) &&
      (entry.startsWith(SPRING_DATA) ||
        resolver.importsFrom(SPRING_DATA) ||
        file.imports.length === 0)
    );
  });
}

function repositoryNames(files) {
  const known = new Set();
  const classes = files.flatMap((file) => {
    const resolver = resolverFor(file);
    return file.classes.map((klass) => ({ klass, file, resolver }));
  });
  let grew = true;
  while (grew) {
    grew = false;
    for (const { klass, file, resolver } of classes) {
      if (!known.has(klass.name) && derivesFromData(klass, file, resolver, known)) {
        known.add(klass.name);
        grew = true;
      }
    }
  }
  return known;
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
