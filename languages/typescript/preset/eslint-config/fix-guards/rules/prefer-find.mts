import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import { toTerm } from '../../../eslint-plugin/rules/analysis/logic/estree-terms.mts';
import { isSideEffectFree } from '../../../eslint-plugin/rules/analysis/logic/term-views.mts';
import { outsideFunctions } from '../../../eslint-plugin/rules/decided/syntax.mts';
import { depthFirst, nodeChildren } from '../../../eslint-plugin/rules/typed/node-views.mts';
import { isCallback, soleReturnedValue } from '../../../eslint-plugin/rules/typed/syntax-views.mts';
import { ts } from '../../../eslint-plugin/rules/typed/typescript-views.mts';
import {
  keptFix,
  reportedNode,
  unfixed,
  type Descriptor,
  type FixGuard,
  type GuardContext,
} from '../guard-types.mts';

type SourceText = GuardContext['sourceCode'];
type Services = ParserServicesWithTypeInformation;

const OPEN_TYPES = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function isTyped(services: SourceText['parserServices']): services is Services {
  return services?.program !== null && services?.program !== undefined;
}

function isPlainRead(member: TSESTree.MemberExpression, services: Services): boolean {
  const symbol = services.getSymbolAtLocation(member.property);
  if (symbol === undefined) {
    return (services.getTypeAtLocation(member.object).flags & OPEN_TYPES) === 0;
  }
  return (symbol.flags & ts.SymbolFlags.Accessor) === 0;
}

function readsNoAccessor(node: TSESTree.Node, sourceCode: SourceText): boolean {
  const services = sourceCode.parserServices;
  const members = [...depthFirst<TSESTree.Node>(node, nodeChildren)].filter(
    (part): part is TSESTree.MemberExpression => part.type === AST_NODE_TYPES.MemberExpression,
  );
  return (
    members.length === 0 ||
    (isTyped(services) && members.every((member) => isPlainRead(member, services)))
  );
}

function isFilterCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const { property } = callee;
  return callee.computed
    ? property.type === AST_NODE_TYPES.Literal && property.value === 'filter'
    : property.type === AST_NODE_TYPES.Identifier && property.name === 'filter';
}

function isPurePredicate(argument: TSESTree.Node | undefined, sourceCode: SourceText): boolean {
  if (argument?.type === AST_NODE_TYPES.Identifier) {
    return argument.name === 'Boolean';
  }
  if (argument === undefined || !isCallback(argument) || argument.async || argument.generator) {
    return false;
  }
  const returned = soleReturnedValue(argument);
  return (
    returned !== undefined &&
    argument.params.every((param) => param.type === AST_NODE_TYPES.Identifier) &&
    isSideEffectFree(toTerm(returned, sourceCode)) &&
    readsNoAccessor(returned, sourceCode)
  );
}

function preferFindGuard(descriptor: Descriptor, context: GuardContext): Descriptor {
  const node = reportedNode(descriptor, 'preferFind');
  if (node === undefined) {
    return descriptor;
  }
  const calls = [...outsideFunctions(node)].filter(isFilterCall);
  const pure =
    calls.length > 0 &&
    calls.every((call) => isPurePredicate(call.arguments[0], context.sourceCode));
  return pure ? keptFix(descriptor) : unfixed(descriptor);
}

export const PREFER_FIND: FixGuard = { status: 'review', guard: preferFindGuard };
