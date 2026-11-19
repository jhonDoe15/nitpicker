import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type {
  Enclosing,
  Framed,
  Hierarchies,
  Hierarchy,
  LookupFact,
  LookupScope,
} from './lookup-types.mts';
import {
  BEAN_ANNOTATION,
  CONFIGURATION_ANNOTATIONS,
  GUICE_MODULES,
  isDefinitionHost,
  KOIN_SCOPE,
  KTOR_APPLICATION,
  PRODUCING_ANNOTATIONS,
  ROOT_SUPERTYPES,
} from './lookup-apis.mts';
import { extendsAny, hierarchyOf, resolvesTo, typeFrames } from './lookup-resolution.mts';

const MAIN_ARGUMENTS = /^Array<\s*(?:out\s+)?String\s*>$/u;

export function hierarchiesOf(files: KotlinFile[]): Hierarchies {
  return { modules: hierarchyOf(files, GUICE_MODULES), roots: hierarchyOf(files, ROOT_SUPERTYPES) };
}

export function enclosingFunction(scopes: LookupScope[]): Enclosing {
  const index = scopes.findIndex(({ k }) => k === 'fun');
  return index === -1
    ? {}
    : { fun: scopes[index], owner: typeFrames(scopes.slice(index + 1)).at(0) };
}

function annotated(file: KotlinFile, frame: LookupScope | undefined, targets: string[]): boolean {
  return (frame?.annotations ?? []).some((name) => resolvesTo(file, name, targets));
}

function takesMainArguments({ parameters = [] }: LookupScope): boolean {
  if (parameters.length === 0) {
    return true;
  }
  const [only] = parameters;
  return (
    only !== undefined &&
    parameters.length === 1 &&
    (only.vararg ? only.type === 'String' : MAIN_ARGUMENTS.test(only.type ?? ''))
  );
}

function isEntryMain({ fun, owner }: Framed): boolean {
  const placed =
    fun.topLevel === true ||
    (owner?.object === true && (fun.annotations ?? []).includes('JvmStatic'));
  return fun.name === 'main' && placed && takesMainArguments(fun);
}

function isModuleConfigure(file: KotlinFile, { fun, owner }: Framed, modules: Hierarchy): boolean {
  return (
    fun.name === 'configure' &&
    (fun.parameters ?? []).length === 0 &&
    owner !== undefined &&
    extendsAny(file, owner.supers ?? [], modules)
  );
}

function takesKoinScope(file: KotlinFile, fun: LookupScope): boolean {
  return [fun.receiver, ...(fun.parameters ?? []).map(({ type }) => type)].some((type) =>
    resolvesTo(file, type, [KOIN_SCOPE]),
  );
}

function isCompositionFunction(
  file: KotlinFile,
  enclosing: Framed,
  hierarchies: Hierarchies,
): boolean {
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

export function isCompositionPoint(
  file: KotlinFile,
  lookup: LookupFact,
  hierarchies: Hierarchies,
): boolean {
  const scopes = lookup.scopes ?? [];
  const enclosing = enclosingFunction(scopes);
  const component = scopes.find(({ k }) => k === 'class');
  return (
    lookup.default ||
    scopes.some(({ k, host }) => k === 'lambda' && isDefinitionHost(host)) ||
    (enclosing.fun !== undefined &&
      isCompositionFunction(file, { fun: enclosing.fun, owner: enclosing.owner }, hierarchies)) ||
    (component !== undefined && extendsAny(file, component.supers ?? [], hierarchies.roots))
  );
}
