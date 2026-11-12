import {
  BEAN_ANNOTATION,
  CONFIGURATION_ANNOTATIONS,
  GUICE_MODULES,
  isDefinitionHost,
  KOIN_SCOPE,
  KTOR_APPLICATION,
  PRODUCING_ANNOTATIONS,
  ROOT_SUPERTYPES,
} from './lookup-apis.mjs';
import { extendsAny, hierarchyOf, resolvesTo, typeFrames } from './lookup-resolution.mjs';

const MAIN_ARGUMENTS = /^Array<\s*(?:out\s+)?String\s*>$/u;

export function hierarchiesOf(files) {
  return { modules: hierarchyOf(files, GUICE_MODULES), roots: hierarchyOf(files, ROOT_SUPERTYPES) };
}

export function enclosingFunction(scopes) {
  const index = scopes.findIndex(({ k }) => k === 'fun');
  return index === -1
    ? {}
    : { fun: scopes[index], owner: typeFrames(scopes.slice(index + 1)).at(0) };
}

function annotated(file, frame, targets) {
  return (frame?.annotations ?? []).some((name) => resolvesTo(file, name, targets));
}

function takesMainArguments({ parameters = [] }) {
  if (parameters.length === 0) {
    return true;
  }
  const [only] = parameters;
  return (
    parameters.length === 1 &&
    (only.vararg ? only.type === 'String' : MAIN_ARGUMENTS.test(only.type ?? ''))
  );
}

function isEntryMain({ fun, owner }) {
  const placed =
    fun.topLevel === true ||
    (owner?.object === true && (fun.annotations ?? []).includes('JvmStatic'));
  return fun.name === 'main' && placed && takesMainArguments(fun);
}

function isModuleConfigure(file, { fun, owner }, modules) {
  return (
    fun.name === 'configure' &&
    (fun.parameters ?? []).length === 0 &&
    owner !== undefined &&
    extendsAny(file, owner.supers ?? [], modules)
  );
}

function takesKoinScope(file, fun) {
  return [fun.receiver, ...(fun.parameters ?? []).map(({ type }) => type)].some((type) =>
    resolvesTo(file, type, [KOIN_SCOPE]),
  );
}

function isCompositionFunction(file, enclosing, hierarchies) {
  const { fun, owner } = enclosing;
  return (
    isEntryMain(enclosing) ||
    isModuleConfigure(file, enclosing, hierarchies.modules) ||
    annotated(file, fun, PRODUCING_ANNOTATIONS) ||
    (annotated(file, fun, [BEAN_ANNOTATION]) &&
      annotated(file, owner, CONFIGURATION_ANNOTATIONS)) ||
    takesKoinScope(file, fun) ||
    resolvesTo(file, fun.receiver, [KTOR_APPLICATION])
  );
}

export function isCompositionPoint(file, lookup, hierarchies) {
  const scopes = lookup.scopes ?? [];
  const enclosing = enclosingFunction(scopes);
  const component = scopes.find(({ k }) => k === 'class');
  return (
    lookup.default === true ||
    scopes.some(({ k, host }) => k === 'lambda' && isDefinitionHost(host)) ||
    (enclosing.fun !== undefined && isCompositionFunction(file, enclosing, hierarchies)) ||
    (component !== undefined && extendsAny(file, component.supers ?? [], hierarchies.roots))
  );
}
