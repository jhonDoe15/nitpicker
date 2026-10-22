import { existsSync } from 'node:fs';
import { pathInside } from '../../review-rules/java-sources.mjs';

function qualifiedNames(files) {
  return new Set(
    files
      .filter(({ test }) => !test)
      .flatMap((file) =>
        file.classes.map((declared) =>
          [file.package, declared.qualified].filter(Boolean).join('.'),
        ),
      ),
  );
}

function javaDeclares(projectRoot, javaRoots) {
  return (qualified) => {
    const parts = qualified.split('.');
    return parts.some((_, index) => {
      const relative = parts.slice(0, parts.length - index).join('/');
      return (
        relative !== '' &&
        javaRoots.some((root) => existsSync(pathInside(projectRoot, `${root}/${relative}.java`)))
      );
    });
  };
}

function candidatesOf(name, file) {
  const [first, ...rest] = name.split('.');
  const imported = file.imports.find(
    ({ path: target, alias, all }) => !all && (alias ?? target.split('.').at(-1)) === first,
  );
  if (imported !== undefined) {
    return [[imported.path, ...rest].join('.')];
  }
  const starred = file.imports
    .filter(({ all }) => all)
    .map(({ path: target }) => `${target}.${name}`);
  return [[file.package, name].filter(Boolean).join('.'), name, ...starred];
}

export function productionTypeResolver({ files, projectRoot, javaRoots = [] }) {
  const kotlin = qualifiedNames(files);
  const java = javaDeclares(projectRoot, javaRoots);
  return (name, file) =>
    candidatesOf(name, file).some((candidate) => kotlin.has(candidate) || java(candidate));
}
