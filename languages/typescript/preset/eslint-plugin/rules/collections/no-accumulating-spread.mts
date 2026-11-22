import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, type SourceCode } from '../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../typed/syntax-views.mts';
import {
  accumulatingSpreadMessageId,
  accumulatingSpreadMessages,
  spreadSuggestionMessages,
  type RuleMessageId,
  type SpreadKind,
  type SpreadMessageId,
} from './accumulating-spread-messages.mts';
import { isKeyedAccumulatingSpread } from './loop-accumulators/keyed-spread-sites.mts';
import { loopSites } from './loop-accumulators/loop-spread-sites.mts';
import { isFixedShape } from './spread-shapes.mts';
import { reduceArrayFix } from '../../fixes/collections/reduce/reduce-array-fix.mts';
import { reduceObjectFix } from '../../fixes/collections/reduce/reduce-object-fix.mts';
import { fixable, suggestible } from '../../fixes/support/descriptors.mts';
import { loopPushFix } from '../../fixes/collections/loops/loop-push-fix.mts';
import type { FixPlan } from '../../fixes/support/ranges.mts';
import type { FixPlans } from '../../fixes/edits/plans.mts';

type Variable = TSESLint.Scope.Variable;
type ParameterDefinition = TSESLint.Scope.Definitions.ParameterDefinition;
type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;
type Report = {
  readonly kind: SpreadKind;
  readonly descriptor: { readonly node: TSESTree.Node };
  readonly callback?: TSESTree.Node;
  readonly variable?: Variable;
  readonly primary: boolean;
};
type LoopFinding = {
  readonly definition: VariableDefinition;
  readonly variable: Variable;
  readonly spread: TSESTree.SpreadElement;
  readonly sourceCode: SourceCode;
};

const { DefinitionType } = TSESLint.Scope;

const REDUCE_METHODS = new Set(['reduce', 'reduceRight']);
const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const WRAPPERS = [
  ...TYPE_ASSERTIONS,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSInstantiationExpression,
];
const REDUCE_KINDS = new Map<string, SpreadKind>([
  [AST_NODE_TYPES.ArrayExpression, 'reduceArray'],
  [AST_NODE_TYPES.ObjectExpression, 'reduceObject'],
]);

function innerExpression(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
}

function staticPropertyName(member: TSESTree.MemberExpression): string | undefined {
  const { property } = member;
  if (!member.computed) {
    return property.type === AST_NODE_TYPES.Identifier ? property.name : undefined;
  }
  if (property.type === AST_NODE_TYPES.Literal) {
    return typeof property.value === 'string' ? property.value : undefined;
  }
  return property.type === AST_NODE_TYPES.TemplateLiteral && property.expressions.length === 0
    ? (property.quasis[0]?.value.cooked ?? undefined)
    : undefined;
}

function isReduceCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.arguments.length < 1 ||
    node.arguments.length > 2
  ) {
    return false;
  }
  const callee =
    node.callee.type === AST_NODE_TYPES.ChainExpression ? node.callee.expression : node.callee;
  const name =
    callee.type === AST_NODE_TYPES.MemberExpression ? staticPropertyName(callee) : undefined;
  return name !== undefined && REDUCE_METHODS.has(name);
}

function bindingIdentifier(parameter: TSESTree.Node | undefined): TSESTree.Identifier | undefined {
  if (parameter?.type === AST_NODE_TYPES.Identifier) {
    return parameter;
  }
  return parameter?.type === AST_NODE_TYPES.AssignmentPattern &&
    parameter.left.type === AST_NODE_TYPES.Identifier
    ? parameter.left
    : undefined;
}

function formalParameters(fn: ParameterDefinition['node']): TSESTree.Parameter[] {
  return fn.params.filter(
    (parameter) => parameter.type !== AST_NODE_TYPES.Identifier || parameter.name !== 'this',
  );
}

function reduceKind(call: TSESTree.CallExpression): SpreadKind {
  const initial = call.arguments[1];
  const kind =
    initial === undefined || initial.type === AST_NODE_TYPES.SpreadElement
      ? undefined
      : REDUCE_KINDS.get(innerExpression(initial).type);
  return kind ?? 'reduce';
}

function reduceReport(
  definition: ParameterDefinition,
  spread: TSESTree.SpreadElement,
): Report | undefined {
  const fn = definition.node;
  const parameters = formalParameters(fn);
  if (parameters.length !== 2 || bindingIdentifier(parameters[0]) !== definition.name) {
    return undefined;
  }
  const call = fn.parent;
  if (!isReduceCall(call) || call.arguments[0] !== fn) {
    return undefined;
  }
  return ancestorsOf(spread).find((node) => FUNCTION_TYPES.has(node.type)) === fn
    ? { kind: reduceKind(call), descriptor: { node: spread }, callback: fn, primary: false }
    : undefined;
}

function loopReport({ definition, variable, spread, sourceCode }: LoopFinding): Report | undefined {
  const declaration = definition.parent;
  if (declaration.kind !== 'let') {
    return undefined;
  }
  const sites = loopSites(variable, declaration, { sourceCode, inner: innerExpression });
  const site = sites?.find((candidate) => candidate.spread === spread);
  return site === undefined
    ? undefined
    : { variable, kind: site.kind, primary: site === sites?.[0], descriptor: { node: spread } };
}

function resolvedVariable(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Variable | undefined {
  return (
    sourceCode
      .getScope(identifier)
      .references.find((reference) => reference.identifier === identifier)?.resolved ?? undefined
  );
}

function identifierSpreadReport(
  spread: TSESTree.SpreadElement,
  sourceCode: SourceCode,
): Report | undefined {
  const { argument } = spread;
  if (
    argument.type !== AST_NODE_TYPES.Identifier ||
    sourceCode.getTokenBefore(argument)?.value === '('
  ) {
    return undefined;
  }
  const variable = resolvedVariable(sourceCode, argument);
  const definition = variable?.defs[0];
  if (definition?.type === DefinitionType.Parameter) {
    return reduceReport(definition, spread);
  }
  return variable !== undefined && definition?.type === DefinitionType.Variable
    ? loopReport({ definition, variable, spread, sourceCode })
    : undefined;
}

function spreadReport(spread: TSESTree.SpreadElement, sourceCode: SourceCode): Report | undefined {
  const direct = identifierSpreadReport(spread, sourceCode);
  if (direct !== undefined) {
    return direct;
  }
  return isKeyedAccumulatingSpread(spread, sourceCode)
    ? { kind: 'keyedArray', descriptor: { node: spread }, primary: false }
    : undefined;
}

type RuleContext = Readonly<TSESLint.RuleContext<RuleMessageId, []>>;

function fixPlanOf(context: RuleContext, report: Report): FixPlan | undefined {
  if (report.callback === undefined) {
    return undefined;
  }
  if (report.kind === 'reduceObject') {
    return reduceObjectFix(context, report.callback);
  }
  return report.kind === 'reduceArray' ? reduceArrayFix(context, report.callback) : undefined;
}

function pushPlanOf(
  context: RuleContext,
  report: Report,
  messageId: SpreadMessageId,
): FixPlans | undefined {
  return report.kind === 'loopArray' &&
    report.variable !== undefined &&
    report.primary &&
    !messageId.startsWith('domain')
    ? loopPushFix(context, report.variable)
    : undefined;
}

export const rule: TSESLint.RuleModule<RuleMessageId> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow spreading a reduce accumulator or a loop accumulator into its own next value',
    },
    schema: [],
    messages: { ...accumulatingSpreadMessages, ...spreadSuggestionMessages },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      SpreadElement(spread) {
        const report = spreadReport(spread, sourceCode);
        if (report !== undefined && !isFixedShape(spread)) {
          const messageId = accumulatingSpreadMessageId(report.kind, context.filename);
          const descriptor = fixable(
            { ...report.descriptor, messageId },
            fixPlanOf(context, report),
          );
          context.report(
            suggestible(descriptor, {
              messageId: 'pushOntoArray',
              plan: pushPlanOf(context, report, messageId),
            }),
          );
        }
      },
    };
  },
};
