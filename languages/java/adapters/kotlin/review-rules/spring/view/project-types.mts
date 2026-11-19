import {
  javaConverted,
  javaSource,
  exactly,
  javaSupers,
  isJavaEnum,
  readConverted,
  readJavaSource,
} from '../typed/java-source.mts';
import { memoized, once } from '../typed/memoized.mts';
import { nameResolver, resolvesTo, typeName } from '../spring-names.mts';
import { ADVICE, ASPECT, DATA_REPOSITORIES } from '../spring-types.mts';
import { appendAll } from '../../../../../../../shared/lists/items.mjs';
import type {
  ContextInput,
  Fqns,
  FunctionFact,
  Member,
  NamedAnnotation,
  ProjectClass,
  ProjectContext,
  Resolve,
  SourceFile,
  Super,
} from '../typed/spring-shapes.mts';

export { javaConverted, isJavaEnum };

const SEARCH_LIMIT = 64;
const META_DEPTH = 3;
const DATA_REPOSITORY = /^org\.springframework\.data\.(?:[a-z]\w*\.)+\w*Repository$/u;
const ANNOTATION_POINTCUT = /@annotation\(\s*([\w.$]+)\s*\)/gu;
const BINDING = /^[a-z_$][\w$]*$/u;

function qualifiedClasses(files: SourceFile[]): Map<string, ProjectClass> {
  const classes = new Map<string, ProjectClass>();
  for (const file of files) {
    for (const declared of file.classes) {
      classes.set([file.package, declared.qualified].filter(Boolean).join('.'), { file, declared });
    }
  }
  return classes;
}

function resolverOf(context: ProjectContext, file: SourceFile): Resolve {
  const known = context.resolvers.get(file);
  if (known !== undefined) {
    return known;
  }
  const resolver = nameResolver(file, context.declared);
  context.resolvers.set(file, resolver);
  return resolver;
}

function supersOf(context: ProjectContext, candidate: string): Super[] {
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

function dataRepository(context: ProjectContext, candidate: string): boolean {
  return (
    DATA_REPOSITORY.test(candidate) &&
    !context.classes.has(candidate) &&
    javaSource(context, candidate) === undefined
  );
}

function enqueueSupers(
  context: ProjectContext,
  name: string,
  search: { queue: { name: string; exact: boolean }[]; seen: Set<string> },
): void {
  const { queue, seen } = search;
  if (queue.length < SEARCH_LIMIT) {
    const fresh = supersOf(context, name).filter((next) => !seen.has(next.name));
    for (const next of fresh) {
      seen.add(next.name);
    }
    appendAll(queue, fresh);
  }
}

function reaches(context: ProjectContext, start: string[], targets: Fqns): boolean {
  const queue = exactly(start);
  const seen = new Set(queue.map((entry) => entry.name));
  for (const { name, exact } of queue) {
    if (
      targets.has(name) ||
      (exact && targets === DATA_REPOSITORIES && dataRepository(context, name))
    ) {
      return true;
    }
    enqueueSupers(context, name, { queue, seen });
  }
  return false;
}

export function projectContext({
  projectFiles,
  declared,
  projectRoot,
  javaRoots,
}: ContextInput): ProjectContext {
  const roots = { projectRoot, javaRoots };
  const context: ProjectContext = {
    projectFiles,
    classes: qualifiedClasses(projectFiles),
    resolvers: new Map(),
    declared,
    projectRoot,
    javaRoots,
    javaSource: memoized((qualified: string) => readJavaSource(roots, qualified)),
    converted: once(() => readConverted(roots)),
    advised: once(() => adviceSet(context)),
    reachCache: memoized(() => new Map<string, boolean>()),
  };
  return context;
}

export function reachesType(
  context: ProjectContext,
  { resolve, text, targets }: { resolve: Resolve; text: string | undefined; targets: Fqns },
): boolean {
  const name = typeName(text);
  if (name === '') {
    return false;
  }
  const start = resolve(name);
  const key = start.join(' ');
  const cache = context.reachCache(targets);
  const known = cache.get(key);
  if (known !== undefined) {
    return known;
  }
  const found = reaches(context, start, targets);
  cache.set(key, found);
  return found;
}

export function isRepositoryType(
  context: ProjectContext,
  resolve: Resolve,
  text: string | undefined,
): boolean {
  return reachesType(context, { resolve, text, targets: DATA_REPOSITORIES });
}

export function projectClass(
  context: ProjectContext,
  candidates: string[],
): ProjectClass | undefined {
  return candidates.map((candidate) => context.classes.get(candidate)).find(Boolean);
}

export function extendsType(
  context: ProjectContext,
  start: { resolve: Resolve; text: string },
  fqns: Fqns,
): boolean {
  const queue = [{ names: start.resolve, type: start.text }];
  const seen = new Set();
  for (const { names, type } of queue) {
    if (resolvesTo(names, type, fqns)) {
      return true;
    }
    const found = projectClass(context, names(typeName(type)));
    if (found !== undefined && !seen.has(found) && queue.length < SEARCH_LIMIT) {
      seen.add(found);
      const own = resolverOf(context, found.file);
      appendAll(
        queue,
        found.declared.supers.map((next) => ({ names: own, type: next })),
      );
    }
  }
  return false;
}

export function projectFunctions(
  context: ProjectContext,
  candidates: string[],
  name: string,
): FunctionFact[] {
  const queue = [projectClass(context, candidates)].filter((found) => found !== undefined);
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
    appendAll(queue, queue.length < SEARCH_LIMIT ? supers : []);
  }
  return [];
}

export function ownersOf(file: SourceFile, qualified: string | undefined): Set<string | undefined> {
  const companions = file.classes
    .filter(({ kind }) => kind === 'companion')
    .map((declared) => declared.qualified)
    .filter((companion) => companion.slice(0, companion.lastIndexOf('.')) === qualified);
  return new Set([qualified, ...companions]);
}

export function membersOfClass(found: ProjectClass): Member[] {
  const { file, declared } = found;
  const owners = ownersOf(file, declared.qualified);
  return [
    ...declared.primaryParameters.filter(({ property }) => property !== undefined),
    ...file.properties.filter(({ owner }) => owners.has(owner)),
  ];
}

function annotationsOf(context: ProjectContext, candidates: string[]): NamedAnnotation[] {
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

export function metaAnnotated(context: ProjectContext, candidates: string[], fqns: Fqns): boolean {
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

function pointcutTargets(resolve: Resolve, fn: FunctionFact): string[] {
  return (fn.annotationEntries ?? [])
    .filter((entry) => resolvesTo(resolve, entry.type ?? entry.name, ADVICE))
    .flatMap((entry) => entry.arguments.map(({ text }) => text))
    .flatMap((text) => [...text.matchAll(ANNOTATION_POINTCUT)].map((match) => match[1] ?? ''))
    .map(
      (target) =>
        fn.parameters.find(({ name }) => BINDING.test(target) && name === target)?.type ?? target,
    )
    .flatMap((type) => resolve(typeName(type)));
}

function adviceSet(context: ProjectContext): Set<string> {
  return new Set(
    context.projectFiles.flatMap((file) => {
      const resolve = resolverOf(context, file);
      const aspects = new Set(
        file.classes
          .filter((declared) =>
            declared.annotations.some(({ type, name }) =>
              resolvesTo(resolve, type ?? name, ASPECT),
            ),
          )
          .map((declared) => declared.qualified),
      );
      return file.functions
        .filter((fn) => aspects.has(fn.owner))
        .flatMap((fn) => pointcutTargets(resolve, fn));
    }),
  );
}

export function adviceTargets(context: ProjectContext): Set<string> {
  return context.advised();
}
