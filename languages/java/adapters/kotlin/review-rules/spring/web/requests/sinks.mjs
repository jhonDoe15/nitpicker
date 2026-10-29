import { annotationIn } from '../../spring-names.mjs';
import { entriesOf, managed } from '../../spring-scopes.mjs';
import { BEAN, CONFIGURATION_CLASSES, SPRING_CLIENT_FACTORIES } from '../../spring-types.mjs';
import { bindingIndex } from './bindings.mjs';

const BUILT = new Set(['build', 'create']);
const ROOT = /^[\p{L}_][\p{L}\p{N}_]*/u;
const CONSTRUCTOR_REGIONS = new Set(['class', 'init']);
const REGIONS = new Set(['fun', 'init', 'class', 'object']);

function inferredType(view, invocation, root) {
  const declared = bindingIndex(view).declaration(invocation.scope, root, {
    line: invocation.line,
  });
  const origin = declared?.origin;
  if (origin === undefined || origin === null || !view.is(origin.root, SPRING_CLIENT_FACTORIES)) {
    return undefined;
  }
  if (BUILT.has(origin.call)) {
    return origin.root;
  }
  return origin.call === 'builder' ? `${origin.root}.Builder` : undefined;
}

export function typed(view, invocation, fqns) {
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

export function judged(view, scope) {
  const region = view.chain(scope).find(({ k }) => REGIONS.has(k));
  const owner = view.classAt(scope);
  if (annotationIn(view.resolve, entriesOf(owner ?? {}), CONFIGURATION_CLASSES) !== undefined) {
    return false;
  }
  if (region?.k === 'fun') {
    const fn = view.functionOf(region);
    const constructor = fn?.name === '<init>' || region.name === '<init>';
    return (
      annotationIn(view.resolve, entriesOf(fn ?? {}), BEAN) === undefined &&
      !(constructor && managed(view, owner))
    );
  }
  return !(CONSTRUCTOR_REGIONS.has(region?.k) && managed(view, owner));
}
