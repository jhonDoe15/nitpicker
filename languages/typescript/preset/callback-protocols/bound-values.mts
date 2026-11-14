import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { depthFirst } from '../architecture/typed/syntax-views.mts';
import {
  ancestorsOf,
  declarationFor,
  invokedReadName,
  memberName,
  resolveValue,
  unwrap,
} from './bindings.mts';
import type { Bindings, OptionProperty } from './callback-types.mts';

const ts = typescriptApi();

type Step =
  | { readonly done: true; readonly path: string | undefined }
  | { readonly done: false; readonly next: TypeScript.Node };

function identifierValue(
  node: TypeScript.Identifier,
  bindings: Bindings,
): TypeScript.Node | undefined {
  const declaration = declarationFor(node);
  return (
    (declaration === undefined ? undefined : bindings.get(declaration)) ??
    (declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined)
  );
}

function joinedPath(head: string, parts: readonly string[]): string {
  return [head, ...parts.toReversed()].join('.');
}

function identifierStep(
  node: TypeScript.Identifier,
  bindings: Bindings,
  parts: readonly string[],
): Step {
  const value = identifierValue(node, bindings);
  if (!value || ts.isNewExpression(unwrap(value))) {
    return { done: true, path: joinedPath(node.text, parts) };
  }
  return { done: false, next: value };
}

function accessStep(node: TypeScript.Node, bindings: Bindings, parts: string[]): Step {
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return { done: true, path: joinedPath('this', parts) };
  }
  if (ts.isIdentifier(node)) {
    return identifierStep(node, bindings, parts);
  }
  const part = invokedReadName(node);
  if (
    part === undefined ||
    !(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
  ) {
    return { done: true, path: undefined };
  }
  parts.push(part);
  return { done: false, next: node.expression };
}

export function accessPath(
  expression: TypeScript.Node,
  bindings: Bindings,
  seen = new Set<TypeScript.Node>(),
): string | undefined {
  const pending = [expression];
  const parts: string[] = [];
  for (const current of pending) {
    const node = unwrap(current);
    if (seen.has(node)) {
      return undefined;
    }
    seen.add(node);
    const step = accessStep(node, bindings, parts);
    if (step.done) {
      return step.path;
    }
    pending.push(step.next);
  }
  return undefined;
}

export function constructedTarget(node: TypeScript.Node): string | undefined {
  const parent = ancestorsOf(node).find(
    (candidate) => !(ts.isParenthesizedExpression(candidate) || ts.isAsExpression(candidate)),
  );
  if (
    parent &&
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    return accessPath(parent.left, new Map());
  }
  if (parent && ts.isVariableDeclaration(parent)) {
    return memberName(parent.name);
  }
  if (parent && ts.isPropertyDeclaration(parent)) {
    return `this.${String(memberName(parent.name))}`;
  }
  return undefined;
}

type OptionFrame =
  | { readonly value: TypeScript.Node; readonly property?: undefined }
  | { readonly property: TypeScript.ObjectLiteralElementLike; readonly value?: undefined };

function optionProperty(property: TypeScript.ObjectLiteralElementLike): OptionProperty[] {
  if (ts.isPropertyAssignment(property)) {
    return [{ name: memberName(property.name), value: property.initializer, node: property }];
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return [{ name: property.name.text, value: property.name, node: property }];
  }
  if (ts.isMethodDeclaration(property)) {
    return [{ name: memberName(property.name), value: property, node: property }];
  }
  return [];
}

export function optionProperties(
  object: TypeScript.Node,
  bindings: Bindings,
  seen = new Set<TypeScript.Node>(),
): OptionProperty[] {
  function children(frame: OptionFrame): OptionFrame[] {
    if (frame.property) {
      return ts.isSpreadAssignment(frame.property) ? [{ value: frame.property.expression }] : [];
    }
    const resolved = resolveValue(frame.value, bindings);
    if (!resolved || !ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) {
      return [];
    }
    seen.add(resolved);
    return [...resolved.properties].map((property) => ({ property }));
  }
  return [...depthFirst<OptionFrame>({ value: object }, children)].flatMap((frame) =>
    frame.property ? optionProperty(frame.property) : [],
  );
}
