import { memoizer } from '../../build-view.mts';
import { declaredNames, nameResolver, resolvesTo, typeName } from '../spring-names.mts';
import { declaresLocally, implicitReceiver, receiverOf, typeOf } from './local-types.mts';
import {
  adviceTargets,
  extendsType,
  isJavaEnum,
  isRepositoryType,
  javaConverted,
  projectFunctions,
  membersOfClass,
  metaAnnotated,
  ownersOf,
  projectClass,
  projectContext,
} from './project-types.mts';
import type {
  Fqns,
  ProjectContext,
  ScopeFact,
  ScopedView,
  SourceFile,
  SpringView,
  ViewInput,
  ViewableFile,
} from '../typed/spring-shapes.mts';

function nearest(chain: ScopeFact[], kinds: string[]): ScopeFact | undefined {
  return chain.find(({ k }) => kinds.includes(k));
}

function scopeChains(scopes: ScopeFact[]): Map<number | undefined, ScopeFact[]> {
  const chains = new Map<number | undefined, ScopeFact[]>();
  for (const scope of scopes) {
    chains.set(scope.id, [scope, ...(chains.get(scope.parent) ?? [])]);
  }
  return chains;
}

function scopedTo(file: SourceFile, context: ProjectContext): ScopedView {
  const resolve = nameResolver(file, context.declared);
  return {
    resolve,
    projectClass: (text: string) => projectClass(context, resolve(text)),
    metaAnnotated: (text: string, fqns: Fqns) => metaAnnotated(context, resolve(text), fqns),
  };
}

function fileView(file: ViewableFile, context: ProjectContext): SpringView {
  const resolve = nameResolver(file, context.declared);
  const chains = scopeChains(file.scopes);
  const functions = new Map(file.functions.map((fn) => [`${fn.name}:${String(fn.line)}`, fn]));
  const classes = new Map(file.classes.map((declared) => [declared.qualified, declared]));
  const view: SpringView = {
    file: {
      ...file,
      invocations: file.invocations.map((invocation) => ({ arguments: [], ...invocation })),
    },
    resolve,
    memo: memoizer(),
    declared: context.declared,
    chain: (id: number | undefined) => chains.get(id) ?? [],
    classes,
    is: (text, fqns) => resolvesTo(resolve, text, fqns),
    scopedTo: (other) => scopedTo(other, context),
    isRepository: (text) => isRepositoryType(context, resolve, text),
    extendsType: (text, fqns) => extendsType(context, { resolve, text }, fqns),
    projectClass: (text) => projectClass(context, resolve(text)),
    projectFunctions: (text, name) => projectFunctions(context, resolve(typeName(text)), name),
    isJavaEnum: (candidates) => isJavaEnum(context, candidates),
    javaConverted: () => javaConverted(context),
    metaAnnotated: (text, fqns) => metaAnnotated(context, resolve(text), fqns),
    advised: () => adviceTargets(context),
    functionOf: (scope) =>
      scope === undefined
        ? undefined
        : functions.get(`${String(scope.name)}:${String(scope.line)}`),
    functionsOf: (qualified) => file.functions.filter(({ owner }) => owner === qualified),
    propertiesOf: (qualified) => file.properties.filter(({ owner }) => owner === qualified),
    memberPropertiesOf: (qualified) => {
      const owners = ownersOf(file, qualified);
      return file.properties.filter(({ owner }) => owners.has(owner));
    },
    memberTypeOf: (ownerType, member) => {
      const found = view.projectClass(ownerType.replace(/[<?].*$/su, ''));
      const entry =
        found === undefined ? undefined : membersOfClass(found).find(({ name }) => name === member);
      return entry?.type ?? entry?.initializer;
    },
    functionAt: (id) => view.functionOf(nearest(view.chain(id), ['fun'])),
    classAt: (id) => classes.get(nearest(view.chain(id), ['class'])?.qualified ?? ''),
    typeOf: (id, text) => typeOf(view, id, text),
    receiverOf: (invocation) => receiverOf(view, invocation),
    declaresLocally: (id, name) => declaresLocally(view, id, name),
    implicitReceiver: (id) => implicitReceiver(view, id),
  };
  return view;
}

export function springViews({
  files,
  projectFiles,
  projectRoot,
  javaRoots = [],
}: ViewInput): SpringView[] {
  const context = projectContext({
    projectFiles,
    declared: declaredNames(projectFiles),
    projectRoot,
    javaRoots,
  });
  return files
    .filter((file): file is ViewableFile => !file.test && file.scopes !== undefined)
    .map((file) => fileView(file, context));
}

export function ruleViews(
  files: ViewInput['files'],
  declaredIn: ViewInput['projectFiles'],
): SpringView[] {
  return springViews({ files, projectFiles: declaredIn, projectRoot: '', javaRoots: [] });
}
