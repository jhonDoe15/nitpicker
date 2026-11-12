import { resolveConstant } from '../../rules/analysis/constant-resolution.mjs';
import { chainHasProperty } from '../../test-quality/test-calls.mjs';
import { propertyName } from './nodes.mjs';

const PLAN_METHODS = new Set(['assertions', 'plan']);
const VITEST_SOURCE = /^vitest(?:\/|$)/u;

function usesVitest(program) {
  return program.body.some(
    (statement) =>
      statement.type === 'ImportDeclaration' && VITEST_SOURCE.test(String(statement.source.value)),
  );
}

function importsNodeTest(bindings) {
  return bindings.nodeTest.named.size > 0 || bindings.nodeTest.namespaces.size > 0;
}

function isTable(call) {
  return ['each', 'for'].some((name) => chainHasProperty(call.callee, name));
}

function rowArity(context, call) {
  const rows = resolveConstant(context, call.callee.arguments?.[0]);
  const elements = rows?.type === 'ArrayExpression' ? rows.elements : [];
  if (elements.length === 0 || elements.some((row) => !row || row.type === 'SpreadElement')) {
    return undefined;
  }
  const sizes = new Set(
    elements.map((row) => (row.type === 'ArrayExpression' ? row.elements.length : 1)),
  );
  return sizes.size === 1 ? [...sizes][0] : undefined;
}

function isCalled(variable) {
  return variable.references.some(
    ({ identifier }) =>
      identifier.parent.type === 'CallExpression' && identifier.parent.callee === identifier,
  );
}

function tableDone(context, call, parameters) {
  const arity = rowArity(context, call);
  const last = parameters.at(-1);
  if (arity === undefined) {
    return { parameter: last, mustBeCalled: true };
  }
  return { parameter: parameters.length === arity + 1 ? last : undefined, mustBeCalled: false };
}

function doneCandidate({ context, bindings }, test, call) {
  const parameters = test.params.filter(
    (parameter) => parameter.type !== 'Identifier' || parameter.name !== 'this',
  );
  if (isTable(call)) {
    return tableDone(context, call, parameters);
  }
  return { parameter: parameters[importsNodeTest(bindings) ? 1 : 0], mustBeCalled: false };
}

export function takesDone(env, test, call) {
  const { context } = env;
  if (test.async || usesVitest(context.sourceCode.ast)) {
    return false;
  }
  const { parameter, mustBeCalled } = doneCandidate(env, test, call);
  if (parameter?.type !== 'Identifier') {
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

function statementCall(statement) {
  const call = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  return call?.type === 'CallExpression' ? call : undefined;
}

function plannerMethod(call, test) {
  const callee = call?.callee;
  const receiver = callee?.type === 'MemberExpression' ? callee.object : undefined;
  const contextName = test.params[0]?.type === 'Identifier' ? test.params[0].name : undefined;
  const isPlanner =
    receiver?.type === 'Identifier' && ['expect', contextName].includes(receiver.name);
  return isPlanner ? propertyName(callee) : undefined;
}

function planCount(statement, test) {
  const call = statementCall(statement);
  const method = plannerMethod(call, test);
  if (method === 'hasAssertions') {
    return { atLeastOne: true };
  }
  const [count] = PLAN_METHODS.has(method) ? call.arguments : [];
  return Number.isInteger(count?.value) && count.value >= 1 ? { count: count.value } : undefined;
}

export function isOwnedByPlan(test, syncAssertions) {
  const statements = test.body.type === 'BlockStatement' ? test.body.body : [];
  const plans = statements.map((statement) => planCount(statement, test)).filter(Boolean);
  return plans.some((plan) =>
    plan.atLeastOne ? syncAssertions === 0 : plan.count > syncAssertions,
  );
}
