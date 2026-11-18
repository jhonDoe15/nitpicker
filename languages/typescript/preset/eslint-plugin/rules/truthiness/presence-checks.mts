import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import {
  ancestorsOf,
  depthFirst,
  isNode,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { returnedExpression } from '../collections/costly-forms/repeated-runs.mts';
import { patternNames } from '../decided/facts.mts';
import { syntaxChildren } from '../decided/syntax.mts';
import {
  nodeEvidenceOf,
  phraseFor,
  typeEvidenceOf,
  type Evidence,
} from './evidence/presence-evidence.mts';
import { isBooleanOnly } from './presence-types.mts';

type MessageId = 'presence' | 'fallback' | 'filter';
type Env = {
  readonly context: Readonly<TSESLint.RuleContext<MessageId, readonly []>>;
  readonly services: ParserServicesWithTypeInformation;
  readonly sourceCode: SourceCode;
  readonly checker: TypeScript.TypeChecker;
};
type FilterCall = TSESTree.CallExpression & {
  readonly callee: TSESTree.MemberExpression;
  readonly arguments: [TSESTree.CallExpressionArgument];
};

const REFERENCES = new Set<string>([
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
  AST_NODE_TYPES.ChainExpression,
]);
function isReference(node: TSESTree.Node): boolean {
  return REFERENCES.has(node.type);
}

function plainText(node: TSESTree.Node, sourceCode: SourceCode): string {
  return sourceCode.getText(node).replaceAll('?.', '.').replaceAll('!', '');
}

function usesValue(branch: TSESTree.Node, test: TSESTree.Node, sourceCode: SourceCode): boolean {
  const text = plainText(test, sourceCode);
  return [...depthFirst<TSESTree.Node>(branch, syntaxChildren)].some(
    (node) => isReference(node) && plainText(node, sourceCode) === text,
  );
}

const EXITS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

function exitsAtEnd(branch: TSESTree.Node): boolean {
  const last = branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  return last !== undefined && EXITS.has(last.type);
}

function negatedOperand(test: TSESTree.Node): TSESTree.Node | undefined {
  return test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!'
    ? test.argument
    : undefined;
}

function followingStatements(node: TSESTree.IfStatement): readonly TSESTree.Node[] {
  const siblings: unknown = Reflect.get(node.parent, 'body');
  const following: unknown[] = Array.isArray(siblings)
    ? siblings.slice(siblings.indexOf(node) + 1)
    : [];
  return following.filter(isNode);
}

function isConditionLink(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.LogicalExpression ||
    (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!')
  );
}

function isInCondition(node: TSESTree.Node): boolean {
  let child = node;
  for (const parent of ancestorsOf(node)) {
    if (!isConditionLink(parent)) {
      return Reflect.get(parent, 'test') === child;
    }
    child = parent;
  }
  return false;
}

function isEmptyDefault(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && (node.value === '' || node.value === false);
}

function returnedIdentifier(body: TSESTree.Node | undefined): TSESTree.Identifier | undefined {
  if (body === undefined) {
    return undefined;
  }
  const value =
    body.type === AST_NODE_TYPES.UnaryExpression &&
    body.operator === '!' &&
    body.argument.type === AST_NODE_TYPES.UnaryExpression
      ? body.argument.argument
      : body;
  return value.type === AST_NODE_TYPES.Identifier ? value : undefined;
}

function predicateSubject(node: TSESTree.Node): TSESTree.Identifier | undefined {
  if (
    (node.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      node.type !== AST_NODE_TYPES.FunctionExpression) ||
    node.params.length !== 1
  ) {
    return undefined;
  }
  const [param] = node.params;
  if (param === undefined) {
    return undefined;
  }
  const returned = returnedIdentifier(returnedExpression(node));
  return returned !== undefined && patternNames(param).includes(returned.name)
    ? returned
    : undefined;
}

function isParameter(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, node);
  return (
    variable?.defs.some(({ type }) => type === TSESLint.Scope.DefinitionType.Parameter) === true
  );
}

function isFilterCall(node: TSESTree.CallExpression): node is FilterCall {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    nameOf(callee.property) === 'filter' &&
    node.arguments.length === 1
  );
}

function textOf(env: Env, node: TSESTree.Node): string {
  return env.sourceCode.getText(node);
}

function evidenceOf(env: Env, node: TSESTree.Node): Evidence | undefined {
  return isReference(node) ? nodeEvidenceOf(env.services, env.checker, node) : undefined;
}

function elementEvidence(env: Env, array: TSESTree.Node): Evidence | undefined {
  const elements = env.checker.getIndexTypeOfType(
    env.services.getTypeAtLocation(array),
    ts.IndexKind.Number,
  );
  return elements === undefined ? undefined : typeEvidenceOf(elements, env.checker);
}

function predicateEvidence(
  env: Env,
  predicate: TSESTree.Node,
  array: TSESTree.Node,
): Evidence | undefined {
  if (predicate.type === AST_NODE_TYPES.Identifier) {
    return predicate.name === 'Boolean' ? elementEvidence(env, array) : undefined;
  }
  const subject = predicateSubject(predicate);
  return subject === undefined ? undefined : evidenceOf(env, subject);
}

function reportPresence(env: Env, test: TSESTree.Node, evidence: Evidence): void {
  const data = { value: textOf(env, test), evidence: phraseFor(evidence) };
  env.context.report({ node: test, messageId: 'presence', data });
}

function isHandledElsewhere(env: Env, test: TSESTree.Node, branch: TSESTree.Node): boolean {
  const isTakenAsIs = textOf(env, branch) === textOf(env, test);
  return isParameter(test, env.sourceCode) && isTakenAsIs;
}

function checkTest(env: Env, test: TSESTree.Node, branch: TSESTree.Node): void {
  const evidence = isHandledElsewhere(env, test, branch) ? undefined : evidenceOf(env, test);
  if (evidence !== undefined && usesValue(branch, test, env.sourceCode)) {
    reportPresence(env, test, evidence);
  }
}

function checkGuard(env: Env, node: TSESTree.IfStatement): void {
  const operand = negatedOperand(node.test);
  const evidence =
    operand !== undefined && exitsAtEnd(node.consequent) ? evidenceOf(env, operand) : undefined;
  if (operand === undefined || evidence === undefined) {
    return;
  }
  const isUsedAfter = followingStatements(node).some((statement) =>
    usesValue(statement, operand, env.sourceCode),
  );
  if (isUsedAfter) {
    reportPresence(env, operand, evidence);
  }
}

function isPlainBooleanOr(env: Env, { left, right }: TSESTree.LogicalExpression): boolean {
  const { services } = env;
  return (
    isBooleanOnly(services.getTypeAtLocation(left)) &&
    isBooleanOnly(services.getTypeAtLocation(right))
  );
}

function checkAnd(env: Env, node: TSESTree.LogicalExpression): void {
  const { left, right } = node;
  const evidence = evidenceOf(env, left);
  if (evidence !== undefined && usesValue(right, left, env.sourceCode)) {
    reportPresence(env, left, evidence);
  }
}

function checkFallback(env: Env, node: TSESTree.LogicalExpression): void {
  const { left, right } = node;
  const isDefault = !(isEmptyDefault(right) || isInCondition(node));
  const isCandidate = isDefault && !isParameter(left, env.sourceCode);
  const evidence = isCandidate ? evidenceOf(env, left) : undefined;
  if (evidence !== undefined && !isPlainBooleanOr(env, node)) {
    const data = {
      value: textOf(env, left),
      fallback: textOf(env, right),
      evidence: phraseFor(evidence),
    };
    env.context.report({ node, messageId: 'fallback', data });
  }
}

function checkLogical(env: Env, node: TSESTree.LogicalExpression): void {
  if (node.operator === '||') {
    checkFallback(env, node);
  } else if (node.operator === '&&') {
    checkAnd(env, node);
  }
}

function checkFilter(env: Env, node: TSESTree.CallExpression): void {
  const evidence = isFilterCall(node)
    ? predicateEvidence(env, node.arguments[0], node.callee.object)
    : undefined;
  if (isFilterCall(node) && evidence !== undefined) {
    const data = { predicate: textOf(env, node.arguments[0]), evidence: phraseFor(evidence) };
    env.context.report({ node, messageId: 'filter', data });
  }
}

export function presenceHandlers(
  context: Readonly<TSESLint.RuleContext<MessageId, readonly []>>,
  services: ParserServicesWithTypeInformation,
): TSESLint.RuleListener {
  const env: Env = {
    context,
    services,
    sourceCode: context.sourceCode,
    checker: services.program.getTypeChecker(),
  };
  return {
    ConditionalExpression(node) {
      checkTest(env, node.test, node.consequent);
    },
    IfStatement(node) {
      checkTest(env, node.test, node.consequent);
      checkGuard(env, node);
    },
    LogicalExpression(node) {
      checkLogical(env, node);
    },
    CallExpression(node) {
      checkFilter(env, node);
    },
  };
}
