import { term } from '../../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { toTerm } from '../../analysis/logic/estree-terms.mjs';
import { fact, factOfTerm } from '../facts.mjs';

const ASSERT_MODULES = new Set(['assert', 'node:assert', 'assert/strict', 'node:assert/strict']);
const CONDITION_METHODS = new Set(['ok']);

function importedFrom(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      const [definition] = variable.defs;
      return definition?.type === 'ImportBinding' ? definition.parent.source.value : undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

function isLibraryAssert(callee, sourceCode) {
  const owner = callee.type === 'MemberExpression' ? callee.object : callee;
  return owner.type === 'Identifier' && ASSERT_MODULES.has(importedFrom(owner, sourceCode));
}

function isNumberLiteral(node) {
  return node.type === 'Literal' && node.regex === undefined && !Number.isNaN(node.value);
}

function libraryFact(call, sourceCode, reason) {
  const { callee, arguments: args } = call;
  const method = callee.type === 'MemberExpression' ? callee.property.name : undefined;
  if (!isLibraryAssert(callee, sourceCode) || args.length === 0) {
    return undefined;
  }
  if (method === undefined || CONDITION_METHODS.has(method)) {
    return fact(args[0], sourceCode, { holds: true, reason });
  }
  const [left, right] = args;
  if (
    method !== 'strictEqual' ||
    right === undefined ||
    !(isNumberLiteral(left) || isNumberLiteral(right))
  ) {
    return undefined;
  }
  return factOfTerm(term('binary', '===', [toTerm(left, sourceCode), toTerm(right, sourceCode)]), {
    holds: true,
    reason: `${reason.split(' throws')[0]} throws unless \`${sourceCode.getText(left)} === ${sourceCode.getText(right)}\``,
  });
}

function projectFact(call, sourceCode, reason) {
  const services = sourceCode.parserServices;
  const node = services?.esTreeNodeToTSNodeMap?.get(call);
  if (node === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const signature = checker.getResolvedSignature(node);
  const predicate =
    signature === undefined ? undefined : checker.getTypePredicateOfSignature(signature);
  const file = signature?.declaration?.getSourceFile();
  const isProject =
    file !== undefined && !file.isDeclarationFile && !file.fileName.includes('node_modules');
  const isCondition =
    predicate?.kind === ts.TypePredicateKind.AssertsIdentifier && predicate.type === undefined;
  const argument = isCondition && isProject ? call.arguments[predicate.parameterIndex] : undefined;
  return argument === undefined ? undefined : fact(argument, sourceCode, { holds: true, reason });
}

/**
 * What a call statement to `node:assert` (`assert(c)`, `assert.ok(c)`, `assert.strictEqual(x,
 * literal)`) or to a project function with an `asserts c` signature guarantees after it.
 */
export function assertionFacts(node, sourceCode) {
  const call = node.type === 'ExpressionStatement' ? node.expression : undefined;
  if (call?.type !== 'CallExpression' || call.optional) {
    return [];
  }
  const line = String(node.loc.start.line);
  const reason = `line ${line} throws unless \`${call.arguments[0] === undefined ? '' : sourceCode.getText(call.arguments[0])}\``;
  const known = libraryFact(call, sourceCode, reason) ?? projectFact(call, sourceCode, reason);
  return known === undefined ? [] : [known];
}
