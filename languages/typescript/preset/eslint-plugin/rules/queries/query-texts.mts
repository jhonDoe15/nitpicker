import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { DYNAMIC } from '../../../../../../shared/rules/security/sql-text.mjs';
import { sqlOrderGaps as untypedSqlOrderGaps } from '../../../../../../shared/rules/queries/sql-order.mjs';
import { stringValue } from '../analysis/constant-resolution.mts';
import {
  memberName,
  resolvedValue,
  unwrapped,
  type Context,
} from '../security/security-values.mts';
import { sinkFor } from '../security/sql/sql-sinks.mts';

export type SqlGap = { readonly kind: string; readonly form: string; readonly index: number };
type Pending = { readonly depth: number } & (
  { readonly template: TSESTree.TemplateLiteral } | { readonly value: TSESTree.Node }
);
type Piece = string | Pending;

const sqlOrderGaps: (text: string) => SqlGap[] = untypedSqlOrderGaps;

const STATEMENT_START = /^\s*(?:\(\s*)?(?:select|with)\b/iu;
const SQL_TAGS = new Set<string | undefined>(['sql', 'SQL']);
const RAW_TAGS = new Set<string | undefined>(['$queryRaw', 'sql']);
const RAW_CALLS = new Set<string | undefined>(['raw']);
const ORDER_WORDS = /\b(?:limit|offset|fetch|array_agg|jsonb?_agg)\b/iu;
const MAX_DEPTH = 4;
const EXPANSIONS = Array.from({ length: 2 * MAX_DEPTH + 2 });

function tagName(tag: TSESTree.Node): string | undefined {
  const target = unwrapped(tag);
  if (target.type === AST_NODE_TYPES.Identifier) {
    return SQL_TAGS.has(target.name) ? target.name : undefined;
  }
  const name = target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
  return RAW_TAGS.has(name) || SQL_TAGS.has(name) ? name : undefined;
}

function isSqlTemplate(node: TSESTree.Node | undefined): node is TSESTree.TaggedTemplateExpression {
  return node?.type === AST_NODE_TYPES.TaggedTemplateExpression && tagName(node.tag) !== undefined;
}

function rawText(context: Context, target: TSESTree.Node): string | undefined {
  const call = target.type === AST_NODE_TYPES.CallExpression ? target : undefined;
  const callee = call === undefined ? undefined : unwrapped(call.callee);
  const raw = callee?.type === AST_NODE_TYPES.MemberExpression && RAW_CALLS.has(memberName(callee));
  const value =
    call !== undefined && raw ? stringValue(resolvedValue(context, call.arguments[0])) : undefined;
  return value ?? stringValue(resolvedValue(context, target));
}

function expandPiece(context: Context, piece: Piece): Piece[] {
  if (typeof piece === 'string') {
    return [piece];
  }
  if ('template' in piece) {
    return piece.template.quasis.flatMap((quasi, index) => {
      const value = piece.template.expressions[index];
      const cooked = quasi.value.cooked ?? '';
      return value === undefined ? [cooked] : [cooked, { value, depth: piece.depth }];
    });
  }
  const target = unwrapped(piece.value);
  if (isSqlTemplate(target)) {
    return piece.depth >= MAX_DEPTH
      ? [DYNAMIC]
      : [{ template: target.quasi, depth: piece.depth + 1 }];
  }
  return [rawText(context, target) ?? DYNAMIC];
}

function templateText(context: Context, template: TSESTree.TemplateLiteral): string {
  const initial: Piece[] = [{ template, depth: 0 }];
  const pieces = EXPANSIONS.reduce<Piece[]>(
    (current) => current.flatMap((piece) => expandPiece(context, piece)),
    initial,
  );
  return pieces.map((piece) => (typeof piece === 'string' ? piece : DYNAMIC)).join('');
}

function isInsideSqlTemplate(node: TSESTree.Node): boolean {
  const parent = node.parent;
  return parent?.type === AST_NODE_TYPES.TemplateLiteral && isSqlTemplate(parent.parent);
}

function consumedAsSql(context: Context, node: TSESTree.Node): boolean {
  return sinkFor(context, node) !== undefined;
}

function sqlTextOf(context: Context, node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.TaggedTemplateExpression) {
    return isSqlTemplate(node) && !isInsideSqlTemplate(node)
      ? templateText(context, node.quasi)
      : undefined;
  }
  if (node.parent?.type === AST_NODE_TYPES.TaggedTemplateExpression || isInsideSqlTemplate(node)) {
    return undefined;
  }
  const text =
    node.type === AST_NODE_TYPES.TemplateLiteral ? templateText(context, node) : stringValue(node);
  if (typeof text !== 'string' || !ORDER_WORDS.test(text)) {
    return undefined;
  }
  return STATEMENT_START.test(text) || consumedAsSql(context, node) ? text : undefined;
}

export function sqlGaps(context: Context, node: TSESTree.Node): SqlGap[] {
  const text = sqlTextOf(context, node);
  return text === undefined ? [] : sqlOrderGaps(text);
}
