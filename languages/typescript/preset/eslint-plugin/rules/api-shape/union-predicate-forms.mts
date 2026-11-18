import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { TYPE_ASSERTIONS, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

type LiteralValue = TSESTree.StringLiteral | TSESTree.NumberLiteral;
type Returned = boolean | typeof FALLS_THROUGH | undefined;
export type Comparison = { readonly subject: TSESTree.Node; readonly value: string | number };

const MINIMUM_ELEMENTS = 2;
const FALLS_THROUGH = 'falls through';

export function isLiteralValue(node: TSESTree.Node): node is LiteralValue {
  return (
    node.type === AST_NODE_TYPES.Literal &&
    (typeof node.value === 'string' || typeof node.value === 'number')
  );
}

export function isPlainReference(node: TSESTree.Node): boolean {
  const pending = [node];
  for (const current of pending) {
    if (current.type !== AST_NODE_TYPES.MemberExpression) {
      return (
        current.type === AST_NODE_TYPES.Identifier || current.type === AST_NODE_TYPES.ThisExpression
      );
    }
    if (current.computed && !isLiteralValue(current.property)) {
      return false;
    }
    pending.push(current.object);
  }
  return false;
}

function withoutTypeWrappers(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, TYPE_ASSERTIONS);
}

function literalElements(node: TSESTree.Node): LiteralValue[] | undefined {
  const list = withoutTypeWrappers(node);
  if (list.type !== AST_NODE_TYPES.ArrayExpression || list.elements.length < MINIMUM_ELEMENTS) {
    return undefined;
  }
  const literals = list.elements.flatMap((element) =>
    element !== null && isLiteralValue(element) ? [element] : [],
  );
  return literals.length === list.elements.length ? literals : undefined;
}

function isNewSet(node: TSESTree.Node): node is TSESTree.NewExpression {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Set' &&
    node.arguments.length === 1
  );
}

function listedElements(callee: TSESTree.MemberExpression): LiteralValue[] | undefined {
  const receiver = withoutTypeWrappers(callee.object);
  const method = nameOf(callee.property);
  if (method === 'includes') {
    return literalElements(receiver);
  }
  if (method !== 'has' || !isNewSet(receiver)) {
    return undefined;
  }
  const [list] = receiver.arguments;
  return list === undefined ? undefined : literalElements(list);
}

export function membershipComparisons(node: TSESTree.Node): Comparison[] | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression || node.optional || node.arguments.length !== 1) {
    return undefined;
  }
  const { callee } = node;
  const [subject] = node.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    subject === undefined ||
    !isPlainReference(subject)
  ) {
    return undefined;
  }
  return listedElements(callee)?.map((element) => ({ subject, value: element.value }));
}

function returnedBoolean(statements: readonly TSESTree.Statement[]): Returned {
  const [first] = statements;
  const body =
    statements.length === 1 && first?.type === AST_NODE_TYPES.BlockStatement
      ? first.body
      : statements;
  if (body.length === 0) {
    return FALLS_THROUGH;
  }
  const [only] = body;
  if (
    body.length === 1 &&
    only?.type === AST_NODE_TYPES.ReturnStatement &&
    only.argument?.type === AST_NODE_TYPES.Literal &&
    typeof only.argument.value === 'boolean'
  ) {
    return only.argument.value;
  }
  return undefined;
}

function effectiveValues(values: readonly Returned[]): Returned[] {
  return values.map((value, index) =>
    value === FALLS_THROUGH ? values.slice(index).find((later) => later !== FALLS_THROUGH) : value,
  );
}

export function switchComparisons(node: TSESTree.SwitchStatement): Comparison[] | undefined {
  const own = node.cases.map((entry) => returnedBoolean(entry.consequent));
  const values = effectiveValues(own);
  const defaultIndex = node.cases.findIndex((entry) => entry.test === null);
  const fallback = own[defaultIndex];
  if (!isPlainReference(node.discriminant) || typeof fallback !== 'boolean') {
    return undefined;
  }
  const listed = node.cases.filter(
    (entry, index) => entry.test !== null && values[index] !== fallback,
  );
  const literals = listed.flatMap((entry) =>
    entry.test !== null && isLiteralValue(entry.test)
      ? [{ subject: node.discriminant, value: entry.test.value }]
      : [],
  );
  const isPartialSwitch =
    listed.length >= MINIMUM_ELEMENTS &&
    values.every((value) => typeof value === 'boolean') &&
    own.every(
      (value, index) => index === defaultIndex || value === FALLS_THROUGH || value !== fallback,
    ) &&
    literals.length === listed.length;
  return isPartialSwitch ? literals : undefined;
}
