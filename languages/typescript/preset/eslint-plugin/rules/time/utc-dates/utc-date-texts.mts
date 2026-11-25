import { AST_NODE_TYPES, ASTUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';
import { literalValue } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

const CUTS = new Set(['slice', 'substring', 'substr']);
const DATE_LENGTH = 10;
const INSTANT_SETTERS = /^set(?:UTC|Time$)/u;

type MethodCall = {
  readonly name: string;
  readonly call: TSESTree.CallExpression;
  readonly receiver: TSESTree.Node;
};

function methodCall(node: TSESTree.Node): MethodCall | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    node.callee.computed ||
    node.callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  return { name: node.callee.property.name, call: node, receiver: node.callee.object };
}

function isDateConstructor(node: TSESTree.Node): node is TSESTree.NewExpression {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Date'
  );
}

function isDateNowCall(node: TSESTree.Node | undefined): boolean {
  const method = node === undefined ? undefined : methodCall(node);
  return (
    method?.name === 'now' &&
    method.receiver.type === AST_NODE_TYPES.Identifier &&
    method.receiver.name === 'Date' &&
    method.call.arguments.length === 0
  );
}

function isCurrentInstant(node: TSESTree.Node): boolean {
  if (!isDateConstructor(node)) {
    return false;
  }
  return (
    node.arguments.length === 0 || (node.arguments.length === 1 && isDateNowCall(node.arguments[0]))
  );
}

function usesUtcParts(variable: TSESLint.Scope.Variable): boolean {
  return variable.references.some((reference) => {
    const member = reference.identifier.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      member.property.type === AST_NODE_TYPES.Identifier &&
      INSTANT_SETTERS.test(member.property.name)
    );
  });
}

function isLocalNow(code: SourceCode, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return isCurrentInstant(node);
  }
  const variable = ASTUtils.findVariable(code.getScope(node), node) ?? undefined;
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (variable === undefined || definition?.type !== DefinitionType.Variable) {
    return false;
  }
  const { init } = definition.node;
  return (
    definition.parent.kind === 'const' &&
    definition.node.id === definition.name &&
    init !== null &&
    isCurrentInstant(init) &&
    !usesUtcParts(variable)
  );
}

function isIsoTextOfNow(code: SourceCode, node: TSESTree.Node): boolean {
  const method = methodCall(node);
  return method?.name === 'toISOString' && isLocalNow(code, method.receiver);
}

function isCutToDate(code: SourceCode, node: TSESTree.CallExpression): boolean {
  const method = methodCall(node);
  return (
    method !== undefined &&
    CUTS.has(method.name) &&
    node.arguments.length === 2 &&
    literalValue(node.arguments[0]) === 0 &&
    literalValue(node.arguments[1]) === DATE_LENGTH &&
    isIsoTextOfNow(code, method.receiver)
  );
}

function isSplitAtTime(code: SourceCode, node: TSESTree.Node): boolean {
  const method = methodCall(node);
  return (
    method?.name === 'split' &&
    literalValue(method.call.arguments[0]) === 'T' &&
    isIsoTextOfNow(code, method.receiver)
  );
}

/** Whether `node` is the UTC calendar date of the current instant, cut out of `toISOString()`. */
export function isUtcToday(code: SourceCode, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isCutToDate(code, node);
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.computed &&
    literalValue(node.property) === 0 &&
    isSplitAtTime(code, node.object)
  );
}
