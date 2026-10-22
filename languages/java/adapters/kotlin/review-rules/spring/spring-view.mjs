import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../review-rules/java-sources.mjs';
import { declaredNames, nameResolver, resolvesTo, typeName } from './spring-names.mjs';
import { DATA_REPOSITORIES } from './spring-types.mjs';

const THIS = /^this\./u;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
function javaExtends(name) {
  return new RegExp(String.raw`\binterface\s+${name}\b[^{]*?\bextends\s+([^{]+)\{`, 'u');
}
const SEARCH_LIMIT = 64;

function qualifiedClasses(files) {
  const classes = new Map();
  for (const file of files) {
    for (const declared of file.classes) {
      classes.set([file.package, declared.qualified].filter(Boolean).join('.'), { file, declared });
    }
  }
  return classes;
}

function javaSource(projectRoot, javaRoots, qualified) {
  const relative = `${qualified.replaceAll('.', '/')}.java`;
  const file = javaRoots
    .map((root) => pathInside(projectRoot, `${root}/${relative}`))
    .find((candidate) => candidate !== undefined && existsSync(candidate));
  return file === undefined ? undefined : readFileSync(file, 'utf8');
}

function resolverOf(context, file) {
  if (!context.resolvers.has(file)) {
    context.resolvers.set(file, nameResolver(file, context.declared));
  }
  return context.resolvers.get(file);
}

function javaSupers(context, candidate) {
  const text = javaSource(context.projectRoot, context.javaRoots, candidate);
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

function reachesRepository(context, start) {
  const queue = [...start];
  for (const candidate of queue) {
    if (DATA_REPOSITORIES.has(candidate)) {
      return true;
    }
    if (queue.length < SEARCH_LIMIT) {
      queue.push(...supersOf(context, candidate).filter((next) => !queue.includes(next)));
    }
  }
  return false;
}

function repositoryDetector({ projectFiles, declared, projectRoot, javaRoots }) {
  const context = {
    classes: qualifiedClasses(projectFiles),
    resolvers: new Map(),
    declared,
    projectRoot,
    javaRoots,
  };
  const known = new Map();
  return (resolve, text) => {
    const name = typeName(text);
    if (name === '') {
      return false;
    }
    const start = resolve(name);
    const key = start.join(' ');
    if (!known.has(key)) {
      known.set(key, reachesRepository(context, start));
    }
    return known.get(key);
  };
}

function nearest(chain, kinds) {
  return chain.find(({ k }) => kinds.includes(k));
}

function scopeChains(scopes) {
  const chains = new Map();
  for (const scope of scopes) {
    chains.set(scope.id, [scope, ...(chains.get(scope.parent) ?? [])]);
  }
  return chains;
}

function fileView(file, shared) {
  const resolve = nameResolver(file, shared.declared);
  const chains = scopeChains(file.scopes);
  const functions = new Map(file.functions.map((fn) => [`${fn.name}:${String(fn.line)}`, fn]));
  const classes = new Map(file.classes.map((declared) => [declared.qualified, declared]));
  const view = {
    file: {
      ...file,
      invocations: file.invocations.map((invocation) => ({ arguments: [], ...invocation })),
    },
    resolve,
    declared: shared.declared,
    chain: (id) => chains.get(id) ?? [],
    classes,
    is: (text, fqns) => resolvesTo(resolve, text, fqns),
    isRepository: (text) => shared.isRepository(resolve, text),
    functionOf: (scope) =>
      scope === undefined ? undefined : functions.get(`${scope.name}:${String(scope.line)}`),
    functionsOf: (qualified) => file.functions.filter(({ owner }) => owner === qualified),
    propertiesOf: (qualified) => file.properties.filter(({ owner }) => owner === qualified),
  };
  view.functionAt = (id) => view.functionOf(nearest(view.chain(id), ['fun']));
  view.classAt = (id) => classes.get(nearest(view.chain(id), ['class'])?.qualified);
  view.typeOf = (id, text) => typeOfName(view, id, (text ?? '').replace(THIS, ''));
  return view;
}

function scopeType(view, scope, name) {
  if (scope.k === 'fun') {
    return view.functionOf(scope)?.parameters.find((entry) => entry.name === name)?.type;
  }
  if (scope.k !== 'class') {
    return undefined;
  }
  const member =
    view.classes
      .get(scope.qualified)
      ?.primaryParameters.find((entry) => entry.name === name && entry.property) ??
    view.propertiesOf(scope.qualified).find((entry) => entry.name === name);
  return member?.type ?? member?.initializer;
}

function typeOfName(view, id, name) {
  if (!IDENTIFIER.test(name)) {
    return undefined;
  }
  for (const scope of view.chain(id)) {
    const type = scopeType(view, scope, name);
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

export function springViews({ files, projectFiles, projectRoot, javaRoots = [] }) {
  const declared = declaredNames(projectFiles);
  const shared = {
    declared,
    isRepository: repositoryDetector({ projectFiles, declared, projectRoot, javaRoots }),
  };
  return files
    .filter(({ test, scopes }) => !test && scopes !== undefined)
    .map((file) => fileView(file, shared));
}
