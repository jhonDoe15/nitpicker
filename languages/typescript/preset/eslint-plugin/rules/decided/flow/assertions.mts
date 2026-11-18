import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { term } from '../../analysis/logic/term-views.mts';
import { toTerm } from '../../analysis/logic/estree-terms.mts';
import { scopeChain, type SourceCode } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { fact, factOfTerm, typedServices, type Fact } from '../facts.mts';

const { DefinitionType } = TSESLint.Scope;
const ASSERT_MODULES = new Set(['assert', 'node:assert', 'assert/strict', 'node:assert/strict']);
const CONDITION_METHODS = new Set(['ok']);

function importedFrom(identifier: TSESTree.Identifier, sourceCode: SourceCode): string | undefined {
  const variable = scopeChain(sourceCode.getScope(identifier))
    .find((scope) => scope.set.has(identifier.name))
    ?.set.get(identifier.name);
  const [definition] = variable?.defs ?? [];
  return definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
    ? definition.parent.source.value
    : undefined;
}

function isLibraryAssert(
  callee: TSESTree.CallExpression['callee'],
  sourceCode: SourceCode,
): boolean {
  const owner = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : callee;
  if (owner.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const source = importedFrom(owner, sourceCode);
  return source !== undefined && ASSERT_MODULES.has(source);
}

function isNumberLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && !('regex' in node) && !Number.isNaN(node.value);
}

function throwsUnless(line: string, text: string): string {
  return `line ${line} throws unless \`${text}\``;
}

function equalityFact(
  [left, right]: readonly [TSESTree.Node, TSESTree.Node],
  sourceCode: SourceCode,
  line: string,
): Fact {
  const equality = term('binary', '===', [toTerm(left, sourceCode), toTerm(right, sourceCode)]);
  const text = `${sourceCode.getText(left)} === ${sourceCode.getText(right)}`;
  return factOfTerm(equality, { holds: true, reason: throwsUnless(line, text) });
}

function libraryFact(
  call: TSESTree.CallExpression,
  sourceCode: SourceCode,
  line: string,
): Fact | undefined {
  const { callee } = call;
  const [left, right] = call.arguments;
  if (left === undefined || !isLibraryAssert(callee, sourceCode)) {
    return undefined;
  }
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : undefined;
  if (method === undefined || CONDITION_METHODS.has(method)) {
    const reason = throwsUnless(line, sourceCode.getText(left));
    return fact(left, sourceCode, { holds: true, reason });
  }
  const isTested = right !== undefined && (isNumberLiteral(left) || isNumberLiteral(right));
  return method === 'strictEqual' && isTested
    ? equalityFact([left, right], sourceCode, line)
    : undefined;
}

function assertedParameter(predicate: TypeScript.TypePredicate | undefined): number | undefined {
  return predicate?.kind === ts.TypePredicateKind.AssertsIdentifier && predicate.type === undefined
    ? predicate.parameterIndex
    : undefined;
}

function projectFact(
  call: TSESTree.CallExpression,
  sourceCode: SourceCode,
  line: string,
): Fact | undefined {
  const services = sourceCode.parserServices;
  if (!typedServices(services)) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const signature = checker.getResolvedSignature(services.esTreeNodeToTSNodeMap.get(call));
  const predicate =
    signature === undefined ? undefined : checker.getTypePredicateOfSignature(signature);
  const file = signature?.declaration?.getSourceFile();
  const isProject =
    file !== undefined && !file.isDeclarationFile && !file.fileName.includes('node_modules');
  const index = assertedParameter(predicate);
  const argument = index !== undefined && isProject ? call.arguments[index] : undefined;
  if (argument === undefined) {
    return undefined;
  }
  return fact(argument, sourceCode, {
    holds: true,
    reason: throwsUnless(line, sourceCode.getText(argument)),
  });
}

/**
 * What a call statement to `node:assert` (`assert(c)`, `assert.ok(c)`, `assert.strictEqual(x,
 * literal)`) or to a project function with an `asserts c` signature guarantees after it.
 */
export function assertionFacts(node: TSESTree.Statement, sourceCode: SourceCode): Fact[] {
  const call = node.type === AST_NODE_TYPES.ExpressionStatement ? node.expression : undefined;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.optional) {
    return [];
  }
  const line = String(node.loc.start.line);
  const known = libraryFact(call, sourceCode, line) ?? projectFact(call, sourceCode, line);
  return known === undefined ? [] : [known];
}
