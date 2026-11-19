import { annotationIn } from '../../spring-names.mts';
import { entriesOf, managed } from '../../spring-scopes.mts';
import { BEAN, CONFIGURATION_CLASSES, SPRING_CLIENT_FACTORIES } from '../../spring-types.mts';
import { bindingIndex } from './bindings.mts';
import type { Fqns, InvocationFact, SpringView } from '../../typed/spring-shapes.mts';

const BUILT = new Set(['build', 'create']);
const ROOT = /^[\p{L}_][\p{L}\p{N}_]*/u;
const CONSTRUCTOR_REGIONS = new Set(['class', 'init']);
const REGIONS = new Set(['fun', 'init', 'class', 'object']);

function inferredType(
  view: SpringView,
  invocation: InvocationFact,
  root: string,
): string | undefined {
  const declared = bindingIndex(view).declaration(invocation.scope, root, {
    line: invocation.line,
  });
  const origin = declared?.origin;
  if (typeof origin?.root !== 'string' || !view.is(origin.root, SPRING_CLIENT_FACTORIES)) {
    return undefined;
  }
  if (origin.call !== undefined && BUILT.has(origin.call)) {
    return origin.root;
  }
  return origin.call === 'builder' ? `${origin.root}.Builder` : undefined;
}

export function typed(view: SpringView, invocation: InvocationFact, fqns: Fqns): boolean {
  const root = ROOT.exec(invocation.receiver ?? '')?.[0];
  if (root === undefined) {
    return false;
  }
  if (view.is(root, fqns)) {
    return true;
  }
  return [view.typeOf(invocation.scope, root), inferredType(view, invocation, root)].some(
    (type) => type !== undefined && view.is(type, fqns),
  );
}

export function judged(view: SpringView, scope: number | undefined): boolean {
  const region = view.chain(scope).find(({ k }) => REGIONS.has(k));
  const owner = view.classAt(scope);
  if (
    owner !== undefined &&
    annotationIn(view.resolve, entriesOf(owner), CONFIGURATION_CLASSES) !== undefined
  ) {
    return false;
  }
  if (region?.k === 'fun') {
    const fn = view.functionOf(region);
    const constructor = fn?.name === '<init>' || region.name === '<init>';
    return (
      (fn === undefined || annotationIn(view.resolve, entriesOf(fn), BEAN) === undefined) &&
      !(constructor && managed(view, owner))
    );
  }
  return !(CONSTRUCTOR_REGIONS.has(region?.k ?? '') && managed(view, owner));
}
