import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, type SourceCode } from '../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../typed/syntax-views.mts';
import {
  accumulatingSpreadMessageId,
  accumulatingSpreadMessages,
  type SpreadKind,
  type SpreadMessageId,
} from './accumulating-spread-messages.mts';
import { isFixedShape } from './spread-shapes.mts';
import { reduceObjectFix } from '../../fixes/collections/reduce/reduce-object-fix.mts';
import { fixable } from '../../fixes/support/descriptors.mts';
import type { FixPlan } from '../../fixes/support/ranges.mts';

type Variable = TSESLint.Scope.Variable;
type ParameterDefinition = TSESLint.Scope.Definitions.ParameterDefinition;
type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;
type Location = { readonly node: TSESTree.Node } | { readonly loc: TSESTree.SourceLocation };
type Report = {
  readonly kind: SpreadKind;
  readonly descriptor: Location;
  readonly declarator?: TSESTree.VariableDeclarator;
  readonly callback?: TSESTree.Node;
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
const LOOP_TYPES = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
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
const LOOP_KINDS = new Map<string, SpreadKind>([
  [AST_NODE_TYPES.ArrayExpression, 'loopArray'],
  [AST_NODE_TYPES.ObjectExpression, 'loopObject'],
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
    ? { kind: reduceKind(call), descriptor: { node: spread }, callback: fn }
    : undefined;
}

function firstAssignment(variable: Variable): TSESTree.AssignmentExpression | undefined {
  const write = variable.references.find((reference) => reference.isWrite() && !reference.init);
  if (write === undefined) {
    return undefined;
  }
  const assignment = write.identifier.parent;
  return assignment.type === AST_NODE_TYPES.AssignmentExpression &&
    assignment.left === write.identifier
    ? assignment
    : undefined;
}

function declaredNameLocation(
  sourceCode: SourceCode,
  id: TSESTree.BindingName,
): TSESTree.SourceLocation {
  const start = id.range[0];
  const end =
    id.type === AST_NODE_TYPES.Identifier
      ? start + id.name.length
      : ((id.typeAnnotation === undefined ? id : sourceCode.getTokenBefore(id.typeAnnotation))
          ?.range[1] ?? id.range[1]);
  return { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(end) };
}

function loopReport({ definition, variable, spread, sourceCode }: LoopFinding): Report | undefined {
  const declaration = definition.parent;
  if (declaration.kind !== 'let') {
    return undefined;
  }
  const assignment = firstAssignment(variable);
  const value = assignment === undefined ? undefined : innerExpression(assignment.right);
  const kind = value === undefined ? undefined : LOOP_KINDS.get(value.type);
  if (value === undefined || kind === undefined || !contains(value, spread)) {
    return undefined;
  }
  const loop = ancestorsOf(spread).find(
    (node) => LOOP_TYPES.has(node.type) && !contains(node, declaration),
  );
  return loop === undefined
    ? undefined
    : {
        declarator: definition.node,
        kind,
        descriptor: { loc: declaredNameLocation(sourceCode, definition.node.id) },
      };
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

function spreadReport(spread: TSESTree.SpreadElement, sourceCode: SourceCode): Report | undefined {
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

function fixPlanOf(
  context: Readonly<TSESLint.RuleContext<SpreadMessageId, []>>,
  report: Report,
): FixPlan | undefined {
  if (report.callback === undefined) {
    return undefined;
  }
  if (report.kind === 'reduceObject') {
    return reduceObjectFix(context, report.callback);
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<SpreadMessageId> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow spreading a reduce accumulator or a loop accumulator into its own next value',
    },
    schema: [],
    messages: accumulatingSpreadMessages,
  },
  create(context) {
    const { sourceCode } = context;
    const seenDeclarators = new Set<TSESTree.VariableDeclarator | undefined>();
    return {
      SpreadElement(spread) {
        const report = spreadReport(spread, sourceCode);
        if (report === undefined || seenDeclarators.has(report.declarator)) {
          return;
        }
        if (report.declarator !== undefined) {
          seenDeclarators.add(report.declarator);
        }
        if (!isFixedShape(spread)) {
          const messageId = accumulatingSpreadMessageId(report.kind, context.filename);
          context.report(fixable({ ...report.descriptor, messageId }, fixPlanOf(context, report)));
        }
      },
    };
  },
};
