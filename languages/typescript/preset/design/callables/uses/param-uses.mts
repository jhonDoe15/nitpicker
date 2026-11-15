import type TypeScript from 'typescript';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { ts, chainOf } from '../../syntax/typed.mts';
import { accessedName, enclosingClosure, isWrapper, staticName } from '../../syntax/nodes.mts';
import { acceptsPosition, declaredParameters, parameterInfo } from '../signature/params.mts';
import { symbolOf } from '../scope.mts';
import { targetSite } from '../calls/targets.mts';
import type { Fact, Scope } from '../../design-types.mts';

type Forward = { target: string; position: number };
type Pattern = { fields: string[]; opaque: boolean };
type Use = { field?: string; opaque?: true; pattern?: Pattern; forward?: Forward };

const TRACKED_KINDS = new Set(['class', 'data', 'interface']);

function skipWrappers(node: TypeScript.Node): TypeScript.Node {
  return (
    chainOf(node, (current) => (isWrapper(current.parent) ? current.parent : undefined)).at(-1) ??
    node
  );
}

function patternFields(pattern: TypeScript.ObjectBindingPattern): Pattern {
  const fields: string[] = [];
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

function forwardUse(
  scope: Scope,
  call: TypeScript.CallExpression | TypeScript.NewExpression,
  argument: TypeScript.Node,
): Forward | undefined {
  const site = targetSite(scope, call);
  const args = call.arguments ?? [];
  const position = args.findIndex((candidate) => candidate === argument);
  const known = site !== undefined && position !== -1 && !args.some(ts.isSpreadElement);
  return known && acceptsPosition(site, position) ? { target: site.id, position } : undefined;
}

function classify(scope: Scope, reference: TypeScript.Node): Use {
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

function referencesTo(scope: Scope, symbol: TypeScript.Symbol): TypeScript.Identifier[] {
  return scope.nodes.filter(
    (node): node is TypeScript.Identifier =>
      ts.isIdentifier(node) &&
      node.text === symbol.name &&
      symbolOf(scope, node) === symbol &&
      node !== fieldOf(symbol.valueDeclaration, 'name'),
  );
}

function summarize(scope: Scope, references: readonly TypeScript.Node[]) {
  const fields = new Set<string>();
  const forwards: Forward[] = [];
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

function isParameterProperty(parameter: TypeScript.ParameterDeclaration): boolean {
  return (
    ts.isConstructorDeclaration(parameter.parent) &&
    (ts.getEffectiveModifierFlags(parameter) &
      (ts.ModifierFlags.AccessibilityModifier | ts.ModifierFlags.Readonly)) !==
      0
  );
}

function usesOf(
  scope: Scope,
  parameter: TypeScript.ParameterDeclaration,
): { fields: string[]; forwards: Forward[]; opaque: boolean } {
  if (ts.isObjectBindingPattern(parameter.name)) {
    const { fields, opaque } = patternFields(parameter.name);
    return { fields, forwards: [], opaque };
  }
  const symbol = scope.checker.getSymbolAtLocation(parameter.name);
  const summary = summarize(scope, symbol === undefined ? [] : referencesTo(scope, symbol));
  return { ...summary, opaque: summary.opaque || isParameterProperty(parameter) };
}

export function paramUseFacts(scope: Scope): Fact[] {
  const uses: Record<string, unknown>[] = [];
  for (const [index, parameter] of declaredParameters(scope.site.node).entries()) {
    const { entry } = parameterInfo(scope, parameter);
    if (entry !== undefined && TRACKED_KINDS.has(entry.kind)) {
      const { fields, forwards, opaque } = usesOf(scope, parameter);
      uses.push({ param: index, fields, forwards, ...(opaque ? { opaque } : {}) });
    }
  }
  return uses;
}
