import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../review-rules/java-sources.mjs';
import { nameResolver, resolvesTo, typeName } from '../spring-names.mjs';
import { DATA_REPOSITORIES } from '../spring-types.mjs';

const SEARCH_LIMIT = 64;
const META_DEPTH = 3;

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
    .flatMap((type) => [`org.springframework.data.repository.${type}`, `${packageName}.${type}`]);
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
  return kotlin.declared.supers.flatMap((type) => resolve(typeName(type)));
}

function reaches(context, start, targets) {
  const queue = [...start];
  for (const candidate of queue) {
    if (targets.has(candidate)) {
      return true;
    }
    if (queue.length < SEARCH_LIMIT) {
      queue.push(...supersOf(context, candidate).filter((next) => !queue.includes(next)));
    }
  }
  return false;
}

export function projectContext({ projectFiles, declared, projectRoot, javaRoots }) {
  return {
    classes: qualifiedClasses(projectFiles),
    resolvers: new Map(),
    javaSources: new Map(),
    reached: new Map(),
    declared,
    projectRoot,
    javaRoots,
  };
}

export function reachesType(context, { resolve, text, targets }) {
  const name = typeName(text);
  if (name === '') {
    return false;
  }
  const start = resolve(name);
  const key = start.join(' ');
  if (!context.reached.has(targets)) {
    context.reached.set(targets, new Map());
  }
  const cache = context.reached.get(targets);
  if (!cache.has(key)) {
    cache.set(key, reaches(context, start, targets));
  }
  return cache.get(key);
}

export function isRepositoryType(context, resolve, text) {
  return reachesType(context, { resolve, text, targets: DATA_REPOSITORIES });
}

export function isJavaEnum(context, candidates) {
  return candidates.some((candidate) => {
    const simple = candidate.split('.').at(-1);
    return new RegExp(String.raw`\benum\s+${simple}\b`, 'u').test(
      javaSource(context, candidate) ?? '',
    );
  });
}

export function projectClass(context, candidates) {
  return candidates.map((candidate) => context.classes.get(candidate)).find(Boolean);
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
