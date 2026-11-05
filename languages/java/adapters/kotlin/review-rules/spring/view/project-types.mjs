import { existsSync, readFileSync } from 'node:fs';
import { javaFilesUnder, pathInside } from '../../../../review-rules/java-sources.mjs';
import { nameResolver, resolvesTo, typeName } from '../spring-names.mjs';
import { DATA_REPOSITORIES } from '../spring-types.mjs';

const SEARCH_LIMIT = 64;
const META_DEPTH = 3;
const AUTO_APPLY = String.raw`@Converter\s*\(\s*(?:autoApply\s*=\s*)?true\s*\)`;
const JAVA_CONVERTER = new RegExp(
  String.raw`${AUTO_APPLY}[^{]*?\bimplements\s+(?:[\w.]+\.)?AttributeConverter\s*<\s*([\w.]+)`,
  'gu',
);
const DATA_REPOSITORY = /^org\.springframework\.data\.(?:[a-z]\w*\.)+\w*Repository$/u;

function javaExtends(name) {
  return new RegExp(String.raw`\binterface\s+${name}\b[^{]*?\bextends\s+([^{]+)\{`, 'u');
}

function qualifiedClasses(files) {
  const classes = new Map();
  for (const file of files) {
    for (const declared of file.classes) {
      classes.set([file.package, declared.qualified].filter(Boolean).join('.'), { file, declared });
    }
  }
  return classes;
}

function javaSource(context, qualified) {
  if (!context.javaSources.has(qualified)) {
    const relative = `${qualified.replaceAll('.', '/')}.java`;
    const file = context.javaRoots
      .map((root) => pathInside(context.projectRoot, `${root}/${relative}`))
      .find((candidate) => candidate !== undefined && existsSync(candidate));
    context.javaSources.set(qualified, file === undefined ? undefined : readFileSync(file, 'utf8'));
  }
  return context.javaSources.get(qualified);
}

function resolverOf(context, file) {
  if (!context.resolvers.has(file)) {
    context.resolvers.set(file, nameResolver(file, context.declared));
  }
  return context.resolvers.get(file);
}

function exactly(names) {
  return names.map((name) => ({ name, exact: names.length === 1 }));
}

function javaImport(text, type) {
  return new RegExp(String.raw`^\s*import\s+([\w.]+\.${type})\s*;`, 'mu').exec(text)?.[1];
}

function javaSupers(context, candidate) {
  const text = javaSource(context, candidate);
  const simple = candidate.split('.').at(-1);
  const extended = text === undefined ? undefined : javaExtends(simple).exec(text)?.[1];
  if (extended === undefined) {
    return [];
  }
  const packageName = candidate.split('.').slice(0, -1).join('.');
  return extended
    .split(',')
    .map((type) => typeName(type))
    .flatMap((type) => {
      const imported = type.includes('.') ? type : javaImport(text, type);
      return imported === undefined
        ? exactly([`org.springframework.data.repository.${type}`, `${packageName}.${type}`])
        : exactly([imported]);
    });
}

function supersOf(context, candidate) {
  const kotlin = context.classes.get(candidate);
  if (kotlin === undefined) {
    return javaSupers(context, candidate);
  }
  if (kotlin.declared.kind !== 'interface') {
    return [];
  }
  const resolve = resolverOf(context, kotlin.file);
  return kotlin.declared.supers.flatMap((type) => exactly(resolve(typeName(type))));
}

function dataRepository(context, candidate) {
  return (
    DATA_REPOSITORY.test(candidate) &&
    !context.classes.has(candidate) &&
    javaSource(context, candidate) === undefined
  );
}

function reachesRepository(context, start) {
  const queue = exactly(start);
  for (const { name, exact } of queue) {
    if (DATA_REPOSITORIES.has(name) || (exact && dataRepository(context, name))) {
      return true;
    }
    if (queue.length < SEARCH_LIMIT) {
      queue.push(
        ...supersOf(context, name).filter((next) => !queue.some((seen) => seen.name === next.name)),
      );
    }
  }
  return false;
}

export function javaConverted(context) {
  if (context.converted === undefined) {
    context.converted = new Set(
      context.javaRoots
        .flatMap((root) => javaFilesUnder(pathInside(context.projectRoot, root)))
        .flatMap((file) => [...readFileSync(file, 'utf8').matchAll(JAVA_CONVERTER)])
        .map((match) => match[1].split('.').at(-1)),
    );
  }
  return context.converted;
}

export function projectContext({ projectFiles, declared, projectRoot, javaRoots }) {
  return {
    classes: qualifiedClasses(projectFiles),
    resolvers: new Map(),
    javaSources: new Map(),
    repositories: new Map(),
    declared,
    projectRoot,
    javaRoots,
  };
}

export function isRepositoryType(context, resolve, text) {
  const name = typeName(text);
  if (name === '') {
    return false;
  }
  const start = resolve(name);
  const key = start.join(' ');
  if (!context.repositories.has(key)) {
    context.repositories.set(key, reachesRepository(context, start));
  }
  return context.repositories.get(key);
}

function enclosingFiles(candidate) {
  const parts = candidate.split('.');
  return parts.slice(1).map((_, index) => parts.slice(0, parts.length - index).join('.'));
}

export function isJavaEnum(context, candidates) {
  return candidates.some((candidate) => {
    const simple = candidate.split('.').at(-1);
    const declaration = new RegExp(String.raw`\benum\s+${simple}\b`, 'u');
    return enclosingFiles(candidate).some((file) =>
      declaration.test(javaSource(context, file) ?? ''),
    );
  });
}

export function projectClass(context, candidates) {
  return candidates.map((candidate) => context.classes.get(candidate)).find(Boolean);
}

export function projectFunctions(context, candidates, name) {
  const queue = [projectClass(context, candidates)].filter(Boolean);
  for (const found of queue) {
    const owners = ownersOf(found.file, found.declared.qualified);
    const declared = found.file.functions.filter((fn) => fn.name === name && owners.has(fn.owner));
    if (declared.length > 0) {
      return declared;
    }
    const resolve = resolverOf(context, found.file);
    const supers = found.declared.supers
      .map((type) => projectClass(context, resolve(typeName(type))))
      .filter((next) => next !== undefined && !queue.includes(next));
    queue.push(...(queue.length < SEARCH_LIMIT ? supers : []));
  }
  return [];
}

export function ownersOf(file, qualified) {
  const companions = file.classes
    .filter(({ kind }) => kind === 'companion')
    .map((declared) => declared.qualified)
    .filter((companion) => companion.slice(0, companion.lastIndexOf('.')) === qualified);
  return new Set([qualified, ...companions]);
}

export function membersOfClass(found) {
  const { file, declared } = found;
  const owners = ownersOf(file, declared.qualified);
  return [
    ...declared.primaryParameters.filter(({ property }) => property !== undefined),
    ...file.properties.filter(({ owner }) => owners.has(owner)),
  ];
}

function annotationsOf(context, candidates) {
  const found = projectClass(context, candidates);
  if (found === undefined) {
    return [];
  }
  const resolve = resolverOf(context, found.file);
  return found.declared.annotations.map((annotation) => ({
    resolve,
    name: annotation.type ?? annotation.name,
  }));
}

export function metaAnnotated(context, candidates, fqns) {
  const levels = [annotationsOf(context, candidates)];
  for (const annotations of levels) {
    if (annotations.some(({ resolve, name }) => resolvesTo(resolve, name, fqns))) {
      return true;
    }
    const next = annotations.flatMap(({ resolve, name }) =>
      annotationsOf(context, resolve(typeName(name))),
    );
    levels.push(...(levels.length < META_DEPTH ? [next] : []));
  }
  return false;
}
