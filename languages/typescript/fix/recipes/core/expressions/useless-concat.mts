import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment } from '../text-ranges.mts';
import { hasLineContinuation, quoted } from './string-literals.mts';

const MAX_LINE = 120;

type Piece = TSESTree.StringLiteral | TSESTree.TemplateLiteral;

function isConcat(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function innermost(node: TSESTree.Node, side: 'left' | 'right'): TSESTree.Node {
  let current = node;
  while (isConcat(current)) {
    current = side === 'left' ? current.right : current.left;
  }
  return current;
}

function pieceOf(node: TSESTree.Node): Piece | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node;
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0
    ? node
    : undefined;
}

function valueOf(piece: Piece): string | undefined {
  return piece.type === AST_NODE_TYPES.Literal
    ? piece.value
    : (piece.quasis[0]?.value.cooked ?? undefined);
}

function lineLength(text: string, offset: number): number {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const newline = text.indexOf('\n', offset);
  return (newline === -1 ? text.length : newline) - start;
}

function isDirectiveSpot(concat: TSESTree.BinaryExpression, left: Piece, right: Piece): boolean {
  return (
    concat.parent.type === AST_NODE_TYPES.ExpressionStatement &&
    concat.left === left &&
    concat.right === right
  );
}

function joined({ text, sourceCode, node }: CoreRequest): CorePlan {
  const concat = isConcat(node) ? node : undefined;
  const left = concat === undefined ? undefined : pieceOf(innermost(concat.left, 'left'));
  const right = concat === undefined ? undefined : pieceOf(innermost(concat.right, 'right'));
  if (concat === undefined || left === undefined || right === undefined) {
    return { declined: 'a side is not a plain string or a template without expressions' };
  }
  const values = [valueOf(left), valueOf(right)];
  const raws = [left, right].map(({ range }) => text.slice(...range));
  if (values.some((value) => value === undefined) || raws.some(hasLineContinuation)) {
    return { declined: 'a literal continues over a line break' };
  }
  const range = { start: left.range[0], end: right.range[1] };
  if (hasComment(sourceCode, range) || isDirectiveSpot(concat, left, right)) {
    return { declined: 'joining would drop a comment or make a directive' };
  }
  const literal = quoted(values.join(''), text.charAt(left.range[0]));
  const grown = lineLength(text, range.start) + literal.length - (range.end - range.start);
  return grown > MAX_LINE && grown > lineLength(text, range.start)
    ? { declined: `the joined literal makes the line longer than ${String(MAX_LINE)} characters` }
    : { edits: [{ ...range, text: literal }] };
}

export const uselessConcatRecipe = coreRuleRecipe({
  id: 'typescript-no-useless-concat',
  rule: 'no-useless-concat',
  plan: joined,
});
