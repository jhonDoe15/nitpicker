import { declaredNames, nameResolver, resolvesTo } from '../spring-names.mjs';
import { declaresLocally, implicitReceiver, receiverOf, typeOf } from './local-types.mjs';
import {
  isJavaEnum,
  isRepositoryType,
  membersOfClass,
  metaAnnotated,
  ownersOf,
  projectClass,
  projectContext,
} from './project-types.mjs';

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

function fileView(file, context) {
  const resolve = nameResolver(file, context.declared);
  const chains = scopeChains(file.scopes);
  const functions = new Map(file.functions.map((fn) => [`${fn.name}:${String(fn.line)}`, fn]));
  const classes = new Map(file.classes.map((declared) => [declared.qualified, declared]));
  const memos = new Map();
  const view = {
    file: {
      ...file,
      invocations: file.invocations.map((invocation) => ({ arguments: [], ...invocation })),
    },
    resolve,
    memo: (key, build) => {
      if (!memos.has(key)) {
        memos.set(key, build());
      }
      return memos.get(key);
    },
    declared: context.declared,
    chain: (id) => chains.get(id) ?? [],
    classes,
    is: (text, fqns) => resolvesTo(resolve, text, fqns),
    isRepository: (text) => isRepositoryType(context, resolve, text),
    projectClass: (text) => projectClass(context, resolve(text)),
    isJavaEnum: (candidates) => isJavaEnum(context, candidates),
    metaAnnotated: (text, fqns) => metaAnnotated(context, resolve(text), fqns),
    functionOf: (scope) =>
      scope === undefined ? undefined : functions.get(`${scope.name}:${String(scope.line)}`),
    functionsOf: (qualified) => file.functions.filter(({ owner }) => owner === qualified),
    propertiesOf: (qualified) => file.properties.filter(({ owner }) => owner === qualified),
    memberPropertiesOf: (qualified) => {
      const owners = ownersOf(file, qualified);
      return file.properties.filter(({ owner }) => owners.has(owner));
    },
  };
  view.memberTypeOf = (ownerType, member) => {
    const found = view.projectClass(ownerType.replace(/[<?].*$/su, ''));
    const entry =
      found === undefined ? undefined : membersOfClass(found).find(({ name }) => name === member);
    return entry?.type ?? entry?.initializer;
  };
  view.functionAt = (id) => view.functionOf(nearest(view.chain(id), ['fun']));
  view.classAt = (id) => classes.get(nearest(view.chain(id), ['class'])?.qualified);
  view.typeOf = (id, text) => typeOf(view, id, text);
  view.receiverOf = (invocation) => receiverOf(view, invocation);
  view.declaresLocally = (id, name) => declaresLocally(view, id, name);
  view.implicitReceiver = (id) => implicitReceiver(view, id);
  return view;
}

export function springViews({ files, projectFiles, projectRoot, javaRoots = [] }) {
  const context = projectContext({
    projectFiles,
    declared: declaredNames(projectFiles),
    projectRoot,
    javaRoots,
  });
  return files
    .filter(({ test, scopes }) => !test && scopes !== undefined)
    .map((file) => fileView(file, context));
}
