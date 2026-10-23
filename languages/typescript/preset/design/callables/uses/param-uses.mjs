import ts from 'typescript';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { accessedName, enclosingClosure, isWrapper, staticName } from '../../syntax/nodes.mjs';
import { acceptsPosition, declaredParameters, parameterInfo } from '../signature/params.mjs';
import { symbolOf } from '../scope.mjs';
import { targetSite } from '../calls/targets.mjs';

const TRACKED_KINDS = new Set(['class', 'data', 'interface']);

function skipWrappers(node) {
  return chainOf(node, (current) =>
    current.parent !== undefined && isWrapper(current.parent) ? current.parent : undefined,
  ).at(-1);
}

function patternFields(pattern) {
  const fields = [];
  let opaque = false;
  for (const element of pattern.elements) {
    const key = element.propertyName ?? element.name;
    const name =
      ts.isBindingElement(element) && !element.dotDotDotToken ? staticName(key) : undefined;
    if (name === undefined) {
      opaque = true;
    } else {
      fields.push(name);
    }
  }
  return { fields, opaque };
}

function forwardUse(scope, call, argument) {
  const site = targetSite(scope, call);
  const position = call.arguments.indexOf(argument);
  const known = site !== undefined && position !== -1 && !call.arguments.some(ts.isSpreadElement);
  return known && acceptsPosition(site, position) ? { target: site.id, position } : undefined;
}

function classify(scope, reference) {
  const node = skipWrappers(reference);
  const parent = node.parent;
  const name = accessedName(parent);
  if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) {
    return parent.expression === node && name !== undefined ? { field: name } : { opaque: true };
  }
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === node &&
    ts.isObjectBindingPattern(parent.name)
  ) {
    return { pattern: patternFields(parent.name) };
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    const forward = forwardUse(scope, parent, node);
    return forward === undefined ? { opaque: true } : { forward };
  }
  return { opaque: true };
}

function referencesTo(scope, symbol) {
  return scope.nodes.filter(
    (node) =>
      ts.isIdentifier(node) &&
      node.text === symbol.name &&
      symbolOf(scope, node) === symbol &&
      node !== symbol.valueDeclaration?.name,
  );
}

function summarize(scope, references) {
  const fields = new Set();
  const forwards = [];
  let opaque = false;
  for (const reference of references) {
    const use = classify(scope, reference);
    opaque = opaque || use.opaque === true || enclosingClosure(reference) !== scope.site.node;
    if (use.field !== undefined) {
      fields.add(use.field);
    }
    for (const field of use.pattern?.fields ?? []) {
      fields.add(field);
    }
    opaque = opaque || use.pattern?.opaque === true;
    if (use.forward !== undefined) {
      forwards.push(use.forward);
    }
  }
  const unique = [
    ...new Map(
      forwards.map((forward) => [`${forward.target}@${String(forward.position)}`, forward]),
    ).values(),
  ];
  return { fields: [...fields], forwards: unique, opaque };
}

function isParameterProperty(parameter) {
  return (
    ts.isConstructorDeclaration(parameter.parent) &&
    (ts.getEffectiveModifierFlags(parameter) &
      (ts.ModifierFlags.AccessibilityModifier | ts.ModifierFlags.Readonly)) !==
      0
  );
}

function usesOf(scope, parameter) {
  if (ts.isObjectBindingPattern(parameter.name)) {
    const { fields, opaque } = patternFields(parameter.name);
    return { fields, forwards: [], opaque };
  }
  const symbol = scope.checker.getSymbolAtLocation(parameter.name);
  const summary = summarize(scope, symbol === undefined ? [] : referencesTo(scope, symbol));
  return { ...summary, opaque: summary.opaque || isParameterProperty(parameter) };
}

export function paramUseFacts(scope) {
  const uses = [];
  for (const [index, parameter] of declaredParameters(scope.site.node).entries()) {
    const { entry } = parameterInfo(scope, parameter);
    if (entry !== undefined && TRACKED_KINDS.has(entry.kind)) {
      const { fields, forwards, opaque } = usesOf(scope, parameter);
      uses.push({ param: index, fields, forwards, ...(opaque ? { opaque } : {}) });
    }
  }
  return uses;
}
