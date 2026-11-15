import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  constantNumber,
  findVariable,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { calleeText, propertyName, unwrap } from './unit-nodes.mts';
import {
  convertedUnit,
  isEpochName,
  unitOfCallName,
  unitOfName,
  type Unit,
} from './unit-views.mts';
import { foldTree } from '../../typed/node-views.mts';

export type UnitValue = { readonly unit: Unit; readonly epoch: boolean };
type MaybeUnit = UnitValue | undefined;
type Operands = readonly [MaybeUnit, MaybeUnit];

const { DefinitionType } = TSESLint.Scope;

const MAX_DEPTH = 8;
const CLAIMS = new Set(['exp', 'iat', 'nbf', 'auth_time']);
const CLAIMS_OWNER = /token|claim|payload|jwt|decode/iu;
const ROUNDING = new Set(['floor', 'round', 'ceil', 'trunc', 'abs']);
const NUMBER_WRAPPERS = new Set(['Number', 'parseInt', 'parseFloat', 'BigInt']);
const EPOCH_CALLS = new Map<string, Unit>([
  ['Date.now', 'ms'],
  ['Date.parse', 'ms'],
  ['Date.UTC', 'ms'],
]);
const CLOCK_CALLS = new Map<string, Unit>([
  ['performance.now', 'ms'],
  ['process.uptime', 's'],
  ['hrtime.bigint', 'ns'],
]);
const NARROWING = new Set(['|', '>>', '<<', '>>>', '^']);
const ARITHMETIC = new Set(['*', '/', '+', '-']);
const KEEPING_CALLS = new Set(['Math.max', 'Math.min']);

function constInitializer(
  context: SourceContext,
  node: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === AST_NODE_TYPES.Identifier
    ? (definition.node.init ?? undefined)
    : undefined;
}

function named(name: string, unit: Unit | undefined): MaybeUnit {
  return unit === undefined ? undefined : { unit, epoch: isEpochName(name) };
}

function memberUnit(node: TSESTree.MemberExpression): MaybeUnit {
  const name = propertyName(node);
  if (name === undefined) {
    return undefined;
  }
  if (CLAIMS.has(name) && CLAIMS_OWNER.test(calleeText(node.object) ?? '')) {
    return { unit: 's', epoch: true };
  }
  return named(name, unitOfName(name));
}

function sameUnit(units: readonly MaybeUnit[]): MaybeUnit {
  const known = units.filter((found) => found !== undefined);
  const [first] = known;
  return first !== undefined && known.every((found) => found.unit === first.unit)
    ? first
    : undefined;
}

function passesUnit(text: string, last: string | undefined): boolean {
  return (
    (text.startsWith('Math.') && last !== undefined && ROUNDING.has(last)) ||
    NUMBER_WRAPPERS.has(text)
  );
}

function clockUnit(text: string): Unit | undefined {
  return [...CLOCK_CALLS].find(([call]) => text === call || text.endsWith(`.${call}`))?.[1];
}

function callOperands(node: TSESTree.CallExpression): TSESTree.Node[] {
  const text = calleeText(node.callee) ?? '';
  if (passesUnit(text, text.split('.').at(-1))) {
    return node.arguments.slice(0, 1);
  }
  return KEEPING_CALLS.has(text) ? node.arguments : [];
}

function callUnit(node: TSESTree.CallExpression, values: readonly MaybeUnit[]): MaybeUnit {
  const text = calleeText(node.callee) ?? '';
  const last = text.split('.').at(-1);
  const epochUnit = EPOCH_CALLS.get(text);
  if (epochUnit !== undefined) {
    return { unit: epochUnit, epoch: true };
  }
  const clock = clockUnit(text);
  if (clock !== undefined) {
    return { unit: clock, epoch: false };
  }
  if (last === 'getTime' && node.arguments.length === 0) {
    return { unit: 'ms', epoch: true };
  }
  if (passesUnit(text, last)) {
    return values[0];
  }
  if (KEEPING_CALLS.has(text)) {
    return sameUnit(values);
  }
  return last === undefined ? undefined : named(last, unitOfCallName(last));
}

function scaled(
  context: SourceContext,
  node: TSESTree.BinaryExpression,
  [left, right]: Operands,
): { unit: Unit | undefined; epoch: boolean } | undefined {
  const leftFactor = constantNumber(context, node.left);
  const rightFactor = constantNumber(context, node.right);
  if (left !== undefined && right === undefined && rightFactor !== undefined) {
    return { unit: convertedUnit(left.unit, rightFactor, node.operator), epoch: left.epoch };
  }
  if (
    node.operator === '*' &&
    right !== undefined &&
    left === undefined &&
    leftFactor !== undefined
  ) {
    return { unit: convertedUnit(right.unit, leftFactor, '*'), epoch: right.epoch };
  }
  return undefined;
}

export function mismatch(left: MaybeUnit, right: MaybeUnit): boolean {
  return left !== undefined && right !== undefined && left.unit !== right.unit;
}

function isText(node: TSESTree.Node): boolean {
  const target = unwrap(node);
  return (
    target.type === AST_NODE_TYPES.TemplateLiteral ||
    (target.type === AST_NODE_TYPES.Literal && typeof target.value === 'string')
  );
}

function additive(
  context: SourceContext,
  node: TSESTree.BinaryExpression,
  [left, right]: Operands,
): MaybeUnit {
  if (isText(node.left) || isText(node.right) || mismatch(left, right)) {
    return undefined;
  }
  const unit = (left ?? right)?.unit;
  if (unit === undefined) {
    return undefined;
  }
  const epoch =
    node.operator === '-'
      ? left?.epoch === true && constantNumber(context, node.right) !== undefined
      : left?.epoch === true || right?.epoch === true;
  return { unit, epoch };
}

export function isNarrowing(context: SourceContext, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    NARROWING.has(node.operator) &&
    constantNumber(context, node.right) === 0
  );
}

function binaryOperands(context: SourceContext, node: TSESTree.BinaryExpression): TSESTree.Node[] {
  if (ARITHMETIC.has(node.operator)) {
    return [node.left, node.right];
  }
  return isNarrowing(context, node) ? [node.left] : [];
}

function binaryUnit(
  context: SourceContext,
  node: TSESTree.BinaryExpression,
  values: readonly MaybeUnit[],
): MaybeUnit {
  if (node.operator === '*' || node.operator === '/') {
    const found = scaled(context, node, [values[0], values[1]]);
    return found?.unit === undefined ? undefined : { unit: found.unit, epoch: found.epoch };
  }
  if (node.operator === '+' || node.operator === '-') {
    return additive(context, node, [values[0], values[1]]);
  }
  return values[0];
}

function identifierOperands(context: SourceContext, node: TSESTree.Identifier): TSESTree.Node[] {
  if (unitOfName(node.name) !== undefined) {
    return [];
  }
  const init = constInitializer(context, node);
  return init === undefined ? [] : [init];
}

function operands(context: SourceContext, node: TSESTree.Node, depth: number): TSESTree.Node[] {
  const target = unwrap(node);
  if (depth > MAX_DEPTH) {
    return [];
  }
  if (target.type === AST_NODE_TYPES.Identifier) {
    return identifierOperands(context, target);
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return callOperands(target);
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return binaryOperands(context, target);
  }
  return target.type === AST_NODE_TYPES.ConditionalExpression
    ? [target.consequent, target.alternate]
    : [];
}

function combined(
  context: SourceContext,
  node: TSESTree.Node,
  values: readonly MaybeUnit[],
): MaybeUnit {
  const target = unwrap(node);
  if (target.type === AST_NODE_TYPES.Identifier) {
    return named(target.name, unitOfName(target.name)) ?? values[0];
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return memberUnit(target);
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return callUnit(target, values);
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return binaryUnit(context, target, values);
  }
  return target.type === AST_NODE_TYPES.ConditionalExpression ? sameUnit(values) : undefined;
}

export function valueUnit(context: SourceContext, node: TSESTree.Node): MaybeUnit {
  return foldTree<TSESTree.Node, number, MaybeUnit>(node, 0, {
    expand: (current, depth) =>
      operands(context, current, depth).map((operand): readonly [TSESTree.Node, number] => [
        operand,
        depth + 1,
      ]),
    combine: (current, _depth, values) => combined(context, current, values),
  });
}
