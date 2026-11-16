import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { term, type Term } from '../../analysis/logic/term-views.mts';
import { toTerm } from '../../analysis/logic/estree-terms.mts';
import { partsOf } from '../../analysis/narrowing/type-parts.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { typedServices, type Fact } from '../facts.mts';

type Assignment = { readonly target: TSESTree.Identifier; readonly value: TSESTree.Expression };

const EXACT = ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLike;

function isConstant(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return (
      node.operator === '-' &&
      node.argument.type === AST_NODE_TYPES.Literal &&
      typeof node.argument.value === 'number'
    );
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0;
  }
  return node.type === AST_NODE_TYPES.Literal && !('regex' in node);
}

function isExactCopy(node: TSESTree.Node, services: SourceCode['parserServices']): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier || !typedServices(services)) {
    return false;
  }
  return partsOf(services.getTypeAtLocation(node)).every((part) => (part.flags & EXACT) !== 0);
}

function assignmentsOf(node: TSESTree.Statement): Assignment[] {
  if (node.type === AST_NODE_TYPES.VariableDeclaration) {
    return node.declarations.flatMap(({ id, init }) =>
      id.type === AST_NODE_TYPES.Identifier && init !== null ? [{ target: id, value: init }] : [],
    );
  }
  const expression = node.type === AST_NODE_TYPES.ExpressionStatement ? node.expression : undefined;
  if (
    expression?.type === AST_NODE_TYPES.AssignmentExpression &&
    expression.operator === '=' &&
    expression.left.type === AST_NODE_TYPES.Identifier
  ) {
    return [{ target: expression.left, value: expression.right }];
  }
  return [];
}

function isTracked({ target, value }: Assignment, services: SourceCode['parserServices']): boolean {
  const isSelf = value.type === AST_NODE_TYPES.Identifier && value.name === target.name;
  return !isSelf && (isConstant(value) || isExactCopy(value, services));
}

function factOf(
  { target, value }: Assignment,
  node: TSESTree.Statement,
  sourceCode: SourceCode,
): Fact {
  const text = sourceCode.getText(value);
  const line = String(node.loc.start.line);
  const equality: Term = term('binary', '===', [
    toTerm(target, sourceCode),
    toTerm(value, sourceCode),
  ]);
  return {
    term: equality,
    names: new Set([
      target.name,
      ...(value.type === AST_NODE_TYPES.Identifier ? [value.name] : []),
    ]),
    readsMembers: false,
    reason: `\`${target.name}\` is set to \`${text}\` on line ${line}`,
  };
}

/**
 * What a declaration or a plain assignment statement tells about the variable it sets: it equals a
 * literal, or another variable of a string or boolean type (a number may be NaN).
 */
export function assignedFacts(node: TSESTree.Statement, sourceCode: SourceCode): Fact[] {
  const services = sourceCode.parserServices;
  return assignmentsOf(node)
    .filter((found) => isTracked(found, services))
    .map((found) => factOf(found, node, sourceCode));
}
