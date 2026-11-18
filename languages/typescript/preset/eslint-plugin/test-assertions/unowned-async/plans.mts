import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../rules/analysis/constant-resolution.mts';
import { chainHasProperty } from '../../test-quality/test-calls.mts';
import { propertyName, type Env, type FileBindings, type FunctionNode } from './nodes.mts';

type DoneCandidate = {
  readonly parameter: TSESTree.Parameter | undefined;
  readonly mustBeCalled: boolean;
};
type Plan = { readonly atLeastOne: true } | { readonly count: number };

const PLAN_METHODS = new Set(['assertions', 'plan']);
const VITEST_SOURCE = /^vitest(?:\/|$)/u;

function usesVitest(program: TSESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      VITEST_SOURCE.test(statement.source.value),
  );
}

function importsNodeTest(bindings: FileBindings): boolean {
  return bindings.nodeTest.named.size > 0 || bindings.nodeTest.namespaces.size > 0;
}

function isTable(call: TSESTree.CallExpression): boolean {
  return ['each', 'for'].some((name) => chainHasProperty(call.callee, name));
}

function rowArity(context: SourceContext, call: TSESTree.CallExpression): number | undefined {
  const { callee } = call;
  const rows = resolveConstant(
    context,
    callee.type === AST_NODE_TYPES.CallExpression ? callee.arguments[0] : undefined,
  );
  const elements = rows?.type === AST_NODE_TYPES.ArrayExpression ? rows.elements : [];
  if (
    elements.length === 0 ||
    elements.some((row) => row === null || row.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  const sizes = new Set(
    elements.map((row) => (row?.type === AST_NODE_TYPES.ArrayExpression ? row.elements.length : 1)),
  );
  return sizes.size === 1 ? [...sizes][0] : undefined;
}

function isCalled(variable: TSESLint.Scope.Variable): boolean {
  return variable.references.some(
    ({ identifier }) =>
      identifier.parent.type === AST_NODE_TYPES.CallExpression &&
      identifier.parent.callee === identifier,
  );
}

function tableDone(
  context: SourceContext,
  call: TSESTree.CallExpression,
  parameters: readonly TSESTree.Parameter[],
): DoneCandidate {
  const arity = rowArity(context, call);
  const last = parameters.at(-1);
  if (arity === undefined) {
    return { parameter: last, mustBeCalled: true };
  }
  return { parameter: parameters.length === arity + 1 ? last : undefined, mustBeCalled: false };
}

function doneCandidate(
  { context, bindings }: Env,
  test: FunctionNode,
  call: TSESTree.CallExpression,
): DoneCandidate {
  const parameters = test.params.filter(
    (parameter) => parameter.type !== AST_NODE_TYPES.Identifier || parameter.name !== 'this',
  );
  if (isTable(call)) {
    return tableDone(context, call, parameters);
  }
  return { parameter: parameters[importsNodeTest(bindings) ? 1 : 0], mustBeCalled: false };
}

export function takesDone(env: Env, test: FunctionNode, call: TSESTree.CallExpression): boolean {
  const { context } = env;
  if (test.async || usesVitest(context.sourceCode.ast)) {
    return false;
  }
  const { parameter, mustBeCalled } = doneCandidate(env, test, call);
  if (parameter?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = context.sourceCode
    .getDeclaredVariables(test)
    .find((candidate) => candidate.name === parameter.name);
  if (variable === undefined) {
    return false;
  }
  return mustBeCalled ? isCalled(variable) : variable.references.length > 0;
}

function statementCall(statement: TSESTree.Node): TSESTree.CallExpression | undefined {
  const call =
    statement.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : undefined;
  return call?.type === AST_NODE_TYPES.CallExpression ? call : undefined;
}

function plannerMethod(
  call: TSESTree.CallExpression | undefined,
  test: FunctionNode,
): string | undefined {
  const callee = call?.callee;
  const receiver = callee?.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  const contextName =
    test.params[0]?.type === AST_NODE_TYPES.Identifier ? test.params[0].name : undefined;
  const isPlanner =
    receiver?.type === AST_NODE_TYPES.Identifier && ['expect', contextName].includes(receiver.name);
  return isPlanner ? propertyName(callee) : undefined;
}

function planCount(statement: TSESTree.Node, test: FunctionNode): Plan | undefined {
  const call = statementCall(statement);
  const method = plannerMethod(call, test);
  if (method === 'hasAssertions') {
    return { atLeastOne: true };
  }
  const [count] =
    call !== undefined && method !== undefined && PLAN_METHODS.has(method) ? call.arguments : [];
  return count?.type === AST_NODE_TYPES.Literal &&
    typeof count.value === 'number' &&
    Number.isInteger(count.value) &&
    count.value >= 1
    ? { count: count.value }
    : undefined;
}

export function isOwnedByPlan(test: FunctionNode, syncAssertions: number): boolean {
  const statements = test.body.type === AST_NODE_TYPES.BlockStatement ? test.body.body : [];
  const plans = statements.flatMap((statement) => planCount(statement, test) ?? []);
  return plans.some((plan) =>
    'atLeastOne' in plan ? syncAssertions === 0 : plan.count > syncAssertions,
  );
}
