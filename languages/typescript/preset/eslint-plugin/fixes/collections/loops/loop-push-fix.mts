import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { hasArrayType } from '../../../rules/support/checked-types.mts';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { contains } from '../../../rules/typed/node-views.mts';
import { allOf, type FixPlans } from '../../edits/plans.mts';
import { freeName } from '../../edits/names.mts';
import { hasCommentIn, replacing, type FixPlan } from '../../support/ranges.mts';
import { accumulationOf, type Accumulation, type Write } from './loop-writes.mts';
import { expressionText } from '../reduce/reduce-site.mts';
import { hasMethod } from '../type-proofs.mts';

type Variable = TSESLint.Scope.Variable;
type Declaration = {
  readonly declaration: TSESTree.VariableDeclaration;
  readonly declarator: TSESTree.VariableDeclarator;
};

const STATEMENT_LISTS = new Set<string>([AST_NODE_TYPES.BlockStatement, AST_NODE_TYPES.Program]);
const WRITE_TARGETS = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.CallExpression,
]);

function declarationOf(variable: Variable): Declaration | undefined {
  const [definition] = variable.defs;
  if (definition?.type !== 'Variable' || variable.defs.length !== 1) {
    return undefined;
  }
  const { node: declarator, parent: declaration } = definition;
  const { init } = declarator;
  return declaration.kind === 'let' &&
    !declaration.declare &&
    declaration.declarations.length === 1 &&
    STATEMENT_LISTS.has(declaration.parent.type) &&
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    !declarator.definite &&
    init?.type === AST_NODE_TYPES.ArrayExpression &&
    init.elements.every((element) => element !== null)
    ? { declaration, declarator }
    : undefined;
}

function isSafeMemberRead(identifier: TSESTree.Identifier | TSESTree.JSXIdentifier): boolean {
  const member = identifier.parent;
  if (member.type !== AST_NODE_TYPES.MemberExpression || member.object !== identifier) {
    return false;
  }
  const isLength = !member.computed && member.property.name === 'length';
  const user = member.parent;
  const writes =
    WRITE_TARGETS.has(user.type) &&
    (user.type !== AST_NODE_TYPES.AssignmentExpression || user.left === member) &&
    (user.type !== AST_NODE_TYPES.CallExpression || user.callee === member);
  return (isLength || member.computed) && !writes;
}

function readsAreSafe(accumulation: Accumulation): boolean {
  if (
    accumulation.reads.some(
      ({ identifier }) => identifier.parent.type === AST_NODE_TYPES.ExportSpecifier,
    )
  ) {
    return false;
  }
  const lastEnd = Math.max(...accumulation.loops.map((loop) => loop.range[1]));
  return accumulation.reads.every(({ identifier }) => {
    const inLoop = accumulation.loops.some((loop) => contains(loop, identifier));
    return inLoop ? isSafeMemberRead(identifier) : identifier.range[0] >= lastEnd;
  });
}

function pushStatement(context: Context, write: Write, name: string): string | undefined {
  const { sourceCode } = context;
  const [only] = write.tail;
  if (write.tail.length === 1 && only?.type === AST_NODE_TYPES.SpreadElement) {
    const item = freeName(sourceCode, {
      sites: [write.statement],
      within: write.statement,
      base: 'item',
    });
    return item !== undefined && hasArrayType(context, only.argument) === 'yes'
      ? `for (const ${item} of ${expressionText(sourceCode, only.argument)}) ${name}.push(${item});`
      : undefined;
  }
  return write.tail.some((element) => element.type === AST_NODE_TYPES.SpreadElement)
    ? undefined
    : `${name}.push(${write.tail.map((element) => expressionText(sourceCode, element)).join(', ')});`;
}

function writePlan(context: Context, write: Write, name: string): FixPlan | undefined {
  const text = pushStatement(context, write, name);
  return text === undefined || hasCommentIn(context.sourceCode, write.statement.range)
    ? undefined
    : replacing(write.statement.range, text);
}

function isPushable(context: Context, { declarator }: Declaration): boolean {
  if (typeServices(context) === undefined) {
    return declarator.id.typeAnnotation === undefined;
  }
  return hasMethod(context, declarator.id, 'push');
}

export function loopPushFix(context: Context, variable: Variable): FixPlans | undefined {
  const found = declarationOf(variable);
  const accumulation =
    found === undefined ? undefined : accumulationOf(variable, found.declaration);
  if (
    found === undefined ||
    accumulation === undefined ||
    !readsAreSafe(accumulation) ||
    !isPushable(context, found) ||
    accumulation.writes.some(
      ({ statement }) =>
        variable.scope.variableScope !== context.sourceCode.getScope(statement).variableScope,
    ) ||
    hasCommentIn(context.sourceCode, found.declaration.range)
  ) {
    return undefined;
  }
  const { range } = found.declaration;
  const plans = [
    replacing([range[0], range[0] + 'let'.length], 'const'),
    ...accumulation.writes.map((write) => writePlan(context, write, variable.name)),
  ];
  return allOf(plans);
}
