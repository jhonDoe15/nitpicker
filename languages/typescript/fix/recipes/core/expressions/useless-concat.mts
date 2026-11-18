import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { CORE_RECIPES } from '../core-recipe-facts.mts';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment } from '../text-ranges.mts';
import { hasLineContinuation, quoted } from './string-literals.mts';

const MAX_LINE = 120;

type Piece = TSESTree.StringLiteral | TSESTree.TemplateLiteral;

function isConcat(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function innermost(node: TSESTree.Node, side: 'left' | 'right'): TSESTree.Node {
  const chain = [node];
  for (const current of chain) {
    if (isConcat(current)) {
      chain.push(side === 'left' ? current.right : current.left);
    }
  }
  return chain.at(-1) ?? node;
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

type Sides = {
  readonly concat: TSESTree.BinaryExpression;
  readonly left: Piece;
  readonly right: Piece;
};

function sidesOf(node: TSESTree.Node): Sides | undefined {
  if (!isConcat(node)) {
    return undefined;
  }
  const left = pieceOf(innermost(node.left, 'left'));
  const right = pieceOf(innermost(node.right, 'right'));
  return left === undefined || right === undefined ? undefined : { concat: node, left, right };
}

function declinedJoin({ text, sourceCode }: CoreRequest, sides: Sides): string | undefined {
  const { concat, left, right } = sides;
  const raws = [left, right].map(({ range }) => text.slice(...range));
  if (
    [left, right].some((piece) => valueOf(piece) === undefined) ||
    raws.some(hasLineContinuation)
  ) {
    return 'a literal continues over a line break';
  }
  const range = { start: left.range[0], end: right.range[1] };
  if (hasComment(sourceCode, range) || isDirectiveSpot(concat, left, right)) {
    return 'joining would drop a comment or make a directive';
  }
  return text.slice(left.range[1], right.range[0]).replaceAll(/\s/gu, '') === '+'
    ? undefined
    : 'a parenthesis sits between the literals';
}

function joined(request: CoreRequest): CorePlan {
  const sides = sidesOf(request.node);
  if (sides === undefined) {
    return { declined: 'a side is not a plain string or a template without expressions' };
  }
  const declined = declinedJoin(request, sides);
  if (declined !== undefined) {
    return { declined };
  }
  const { text } = request;
  const { left, right } = sides;
  const range = { start: left.range[0], end: right.range[1] };
  const literal = quoted([left, right].map(valueOf).join(''), text.charAt(left.range[0]));
  const grown = lineLength(text, range.start) + literal.length - (range.end - range.start);
  return grown > MAX_LINE && grown > lineLength(text, range.start)
    ? { declined: `the joined literal makes the line longer than ${String(MAX_LINE)} characters` }
    : { edits: [{ ...range, text: literal }] };
}

export const uselessConcatRecipe = coreRuleRecipe(CORE_RECIPES.uselessConcat, joined);
