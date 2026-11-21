import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../../typed/node-views.mts';
import { isFunction } from '../../../typed/syntax-views.mts';
import { receiverBoundary } from '../keyed-lookup.mts';
import { isDedupeComparison } from '../receivers/read-only-uses.mts';
import { memberName, repeatedRole, unwrapped } from '../repeated-runs.mts';
import { onlyFixedRepeats, readsElement } from './fixed-repeats.mts';

type Finding = TSESLint.ReportDescriptor<'scanInLoop'>;

const { DefinitionType } = TSESLint.Scope;

const SCANS = new Set(['includes', 'indexOf']);
const DERIVING_STEPS = new Set(['filter', 'flatMap', 'map']);
function isDerivedList(init: TSESTree.Node): boolean {
  const value = unwrapped(init);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      value.elements.length > 0 &&
      value.elements.every((element) => element?.type === AST_NODE_TYPES.SpreadElement)
    );
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(value.callee);
  const [callback] = value.arguments;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    DERIVING_STEPS.has(memberName(callee) ?? '') &&
    callback !== undefined &&
    isFunction(callback)
  );
}

function isArrayBinding(sourceCode: SourceCode, receiver: TSESTree.Identifier): boolean {
  const definition = variableNamed(sourceCode, receiver)?.defs[0];
  return (
    definition?.type === DefinitionType.Variable &&
    definition.node.init !== null &&
    isDerivedList(definition.node.init)
  );
}

function isIndexParameter(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const definition = variableNamed(sourceCode, identifier)?.defs[0];
  return (
    definition?.type === DefinitionType.Parameter &&
    'params' in definition.node &&
    definition.node.params[1] === definition.name
  );
}

export function membershipScan(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): Finding | undefined {
  const callee = unwrapped(call.callee);
  const method = callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : undefined;
  const [value] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    method === undefined ||
    !SCANS.has(method) ||
    call.arguments.length !== 1 ||
    value === undefined ||
    value.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  const receiver = unwrapped(callee.object);
  if (receiver.type !== AST_NODE_TYPES.Identifier || !isArrayBinding(sourceCode, receiver)) {
    return undefined;
  }
  const boundary = receiverBoundary(sourceCode, receiver);
  const role = boundary === undefined ? undefined : repeatedRole(call, boundary);
  if (
    boundary === undefined ||
    role === undefined ||
    role === 'handler' ||
    onlyFixedRepeats(call, boundary) ||
    !readsElement(sourceCode, value, call) ||
    isDedupeComparison(call, (identifier) => isIndexParameter(sourceCode, identifier))
  ) {
    return undefined;
  }
  return {
    node: call,
    messageId: 'scanInLoop',
    data: { name: receiver.name, method, value: sourceCode.getText(value) },
  };
}
