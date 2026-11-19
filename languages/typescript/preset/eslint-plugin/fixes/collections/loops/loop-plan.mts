import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { typeServices, type Context } from '../../../rules/security/security-values.mts';
import { contains } from '../../../rules/typed/node-views.mts';
import { allOf, type FixPlans } from '../../edits/plans.mts';
import { hasCommentIn, replacing, type FixPlan } from '../../support/ranges.mts';
import { accumulationOf, type Accumulation, type Write, type WriteParser } from './loop-writes.mts';
import { hasMethod } from '../reduce/type-proofs.mts';

type Variable = TSESLint.Scope.Variable;
type Declaration = {
  readonly declaration: TSESTree.VariableDeclaration;
  readonly declarator: TSESTree.VariableDeclarator;
};

const { DefinitionType } = TSESLint.Scope;

const STATEMENT_LISTS = new Set<string>([AST_NODE_TYPES.BlockStatement, AST_NODE_TYPES.Program]);
const WRITE_TARGETS = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.UnaryExpression,
  AST_NODE_TYPES.CallExpression,
]);

function declarationOf(variable: Variable): Declaration | undefined {
  const [definition] = variable.defs;
  if (definition?.type !== DefinitionType.Variable || variable.defs.length !== 1) {
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

function isPushCall(member: TSESTree.MemberExpression): boolean {
  const call = member.parent;
  return (
    !member.computed &&
    member.property.name === 'push' &&
    call.type === AST_NODE_TYPES.CallExpression &&
    call.callee === member
  );
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
  return ((isLength || member.computed) && !writes) || isPushCall(member);
}

function lastEnd(loops: readonly TSESTree.Node[]): number {
  let end = 0;
  for (const loop of loops) {
    end = Math.max(end, loop.range[1]);
  }
  return end;
}

function readsAreSafe(accumulation: Accumulation): boolean {
  if (
    accumulation.reads.some(
      ({ identifier }) => identifier.parent.type === AST_NODE_TYPES.ExportSpecifier,
    )
  ) {
    return false;
  }
  const loopsEnd = lastEnd(accumulation.loops);
  return accumulation.reads.every(({ identifier }) => {
    const inLoop = accumulation.loops.some((loop) => contains(loop, identifier));
    return inLoop ? isSafeMemberRead(identifier) : identifier.range[0] >= loopsEnd;
  });
}

function isPushable(context: Context, { declarator }: Declaration): boolean {
  if (typeServices(context) === undefined) {
    return declarator.id.typeAnnotation === undefined;
  }
  return hasMethod(context, declarator.id, 'push');
}

export type LoopRewrite = {
  readonly parse: WriteParser;
  readonly statementOf: (context: Context, write: Write, name: string) => string | undefined;
};

function writePlan(
  context: Context,
  write: Write,
  rewrite: { readonly text: string | undefined },
): FixPlan | undefined {
  return rewrite.text === undefined || hasCommentIn(context.sourceCode, write.statement.range)
    ? undefined
    : replacing(write.statement.range, rewrite.text);
}

export function loopPlan(
  context: Context,
  variable: Variable,
  { parse, statementOf }: LoopRewrite,
): FixPlans | undefined {
  const found = declarationOf(variable);
  const accumulation =
    found === undefined ? undefined : accumulationOf(variable, found.declaration, parse);
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
  return allOf([
    replacing([range[0], range[0] + 'let'.length], 'const'),
    ...accumulation.writes.map((write) =>
      writePlan(context, write, { text: statementOf(context, write, variable.name) }),
    ),
  ]);
}
