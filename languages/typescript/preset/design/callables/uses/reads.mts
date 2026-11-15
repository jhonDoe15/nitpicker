import type TypeScript from 'typescript';
import { ts, chainOf } from '../../syntax/typed.mts';
import {
  accessedName,
  declaredTypeOf,
  isClosure,
  isPlainAssignment,
  lineOf,
  unwrap,
} from '../../syntax/nodes.mts';
import { entryOfNodeOrType } from '../../types/type-lookup.mts';
import { isValueDeclaration, symbolOf } from '../scope.mts';
import { ownFieldOf } from './own-fields.mts';
import type { Fact, Scope } from '../../design-types.mts';

type Node = TypeScript.Node;
type Step = { child: Node; parent: Node | undefined };
type Value = { key: TypeScript.Symbol | string; declaration: Node | undefined };
type ReadValue = { type: string; fields: string[]; decided: string[]; line: number };
type Read = {
  key: TypeScript.Symbol | string;
  type: string;
  field: string;
  decided: boolean;
  line: number;
};

const VALUE_KINDS = new Set(['class', 'data']);
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken]);

function isConditionOf(parent: Node, child: Node): boolean {
  if (ts.isIfStatement(parent) || ts.isWhileStatement(parent) || ts.isDoStatement(parent)) {
    return parent.expression === child;
  }
  if (ts.isForStatement(parent)) {
    return parent.condition === child;
  }
  if (ts.isConditionalExpression(parent)) {
    return parent.condition === child;
  }
  if (ts.isSwitchStatement(parent)) {
    return parent.expression === child;
  }
  return (
    ts.isBinaryExpression(parent) && LOGICAL.has(parent.operatorToken.kind) && parent.left === child
  );
}

function isStatementNode(node: Node): boolean {
  return (
    ts.isBlock(node) ||
    (node.kind >= ts.SyntaxKind.FirstStatement && node.kind <= ts.SyntaxKind.LastStatement)
  );
}

function isActive({ child, parent }: Step): boolean {
  return parent !== undefined && !isClosure(parent) && isConditionOf(parent, child);
}

function climbs(step: Step): step is { child: Node; parent: Node } {
  const { child, parent } = step;
  return (
    parent !== undefined &&
    !isClosure(parent) &&
    !isStatementNode(parent) &&
    !isConditionOf(parent, child)
  );
}

function isDecided(access: Node): boolean {
  const start: Step = { child: access, parent: access.parent };
  const last =
    chainOf(start, (step) =>
      climbs(step) ? { child: step.parent, parent: step.parent.parent } : undefined,
    ).at(-1) ?? start;
  return isActive(last);
}

function valueOf(
  scope: Scope,
  base: TypeScript.Identifier | TypeScript.PropertyAccessExpression,
): Value | undefined {
  if (ts.isIdentifier(base)) {
    const symbol = symbolOf(scope, base);
    const declaration = symbol?.valueDeclaration;
    const inside = declaration !== undefined && declaration.getSourceFile() === scope.sourceFile;
    const local =
      symbol !== undefined &&
      inside &&
      isValueDeclaration(declaration) &&
      isInside(scope, declaration);
    return local ? { key: symbol, declaration } : undefined;
  }
  const field = ownFieldOf(scope, base);
  const symbol = field === undefined ? undefined : scope.checker.getSymbolAtLocation(base.name);
  return field === undefined
    ? undefined
    : { key: `this.${field}`, declaration: symbol?.valueDeclaration };
}

function isInside(scope: Scope, declaration: Node): boolean {
  const { node } = scope.site;
  return declaration.pos >= node.pos && declaration.end <= node.end;
}

function readOf(
  scope: Scope,
  node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression,
): Read | undefined {
  const name = accessedName(node);
  if (name === undefined || !scope.registry.fieldNames.has(name)) {
    return undefined;
  }
  const base = unwrap(node.expression);
  if (base.kind === ts.SyntaxKind.ThisKeyword || isPlainAssignment(node)) {
    return undefined;
  }
  if (!(
    ts.isIdentifier(base) ||
    (ts.isPropertyAccessExpression(base) && ownFieldOf(scope, base))
  )) {
    return undefined;
  }
  const value = valueOf(scope, base);
  const entry =
    value === undefined
      ? undefined
      : entryOfNodeOrType(scope, {
          typeNode: declaredTypeOf(value.declaration),
          type: scope.checker.getTypeAtLocation(base),
        });
  return value !== undefined && entry !== undefined && VALUE_KINDS.has(entry.kind)
    ? { key: value.key, type: entry.id, field: name, decided: isDecided(node), line: lineOf(node) }
    : undefined;
}

export function readFacts(scope: Scope): Fact[] {
  const values = new Map<TypeScript.Symbol | string, ReadValue>();
  for (const node of scope.nodes) {
    const read =
      ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
        ? readOf(scope, node)
        : undefined;
    if (read === undefined) {
      continue;
    }
    const known = values.get(read.key) ?? {
      type: read.type,
      fields: [],
      decided: [],
      line: read.line,
    };
    if (!known.fields.includes(read.field)) {
      known.fields.push(read.field);
    }
    if (read.decided && !known.decided.includes(read.field)) {
      known.decided.push(read.field);
    }
    values.set(read.key, known);
  }
  return [...values.values()].map(({ decided, ...rest }) => ({
    ...rest,
    ...(decided.length === 0 ? {} : { decided }),
  }));
}
