import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { accessedName, isClosure, isPlainAssignment, lineOf, unwrap } from '../../syntax/nodes.mjs';
import { entryOfNodeOrType } from '../../types/type-lookup.mjs';
import { isValueDeclaration, symbolOf } from '../scope.mjs';
import { ownFieldOf } from './own-fields.mjs';

const VALUE_KINDS = new Set(['class', 'data']);
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken]);

function isConditionOf(parent, child) {
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

function isStatementNode(node) {
  return (
    ts.isBlock(node) ||
    (node.kind >= ts.SyntaxKind.FirstStatement && node.kind <= ts.SyntaxKind.LastStatement)
  );
}

function isActive({ child, parent }) {
  return parent !== undefined && !isClosure(parent) && isConditionOf(parent, child);
}

function climbs(step) {
  const { child, parent } = step;
  return (
    parent !== undefined &&
    !isClosure(parent) &&
    !isStatementNode(parent) &&
    !isConditionOf(parent, child)
  );
}

function isDecided(access) {
  const start = { child: access, parent: access.parent };
  const last = chainOf(start, (step) =>
    climbs(step) ? { child: step.parent, parent: step.parent.parent } : undefined,
  ).at(-1);
  return isActive(last);
}

function valueOf(scope, base) {
  if (ts.isIdentifier(base)) {
    const symbol = symbolOf(scope, base);
    const declaration = symbol?.valueDeclaration;
    const inside = declaration !== undefined && declaration.getSourceFile() === scope.sourceFile;
    const local = inside && isValueDeclaration(declaration) && isInside(scope, declaration);
    return local ? { key: symbol, declaration } : undefined;
  }
  const field = ownFieldOf(scope, base);
  const symbol = field === undefined ? undefined : scope.checker.getSymbolAtLocation(base.name);
  return field === undefined
    ? undefined
    : { key: `this.${field}`, declaration: symbol?.valueDeclaration };
}

function isInside(scope, declaration) {
  const { node } = scope.site;
  return declaration.pos >= node.pos && declaration.end <= node.end;
}

function readOf(scope, node) {
  const name = accessedName(node);
  const known = name !== undefined && scope.registry.fieldNames.has(name);
  const base = known ? unwrap(node.expression) : undefined;
  if (base === undefined || base.kind === ts.SyntaxKind.ThisKeyword || isPlainAssignment(node)) {
    return undefined;
  }
  if (!ts.isIdentifier(base) && !(ts.isPropertyAccessExpression(base) && ownFieldOf(scope, base))) {
    return undefined;
  }
  const value = valueOf(scope, base);
  const entry =
    value === undefined
      ? undefined
      : entryOfNodeOrType(scope, {
          typeNode: value.declaration?.type,
          type: scope.checker.getTypeAtLocation(base),
        });
  return entry !== undefined && VALUE_KINDS.has(entry.kind)
    ? { key: value.key, type: entry.id, field: name, decided: isDecided(node), line: lineOf(node) }
    : undefined;
}

export function readFacts(scope) {
  const values = new Map();
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
