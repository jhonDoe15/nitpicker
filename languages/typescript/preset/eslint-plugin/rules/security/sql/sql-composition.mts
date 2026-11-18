import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  DYNAMIC,
  FRAGMENT_BEFORE_VALUE,
  LOOSE_STATEMENT,
  STRONG_STATEMENT,
  VALUE_POSITION,
} from '../../../../../../../shared/rules/security/sql-text.mjs';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { depthFirst } from '../../typed/node-views.mts';
import { memberName, unwrapped, type Context } from '../security-values.mts';
import { classify, type Piece } from './sql-inert.mts';

type Prefix = { readonly before: string; readonly after: string };
type SinkTest = (text: string, prefixes: readonly Prefix[]) => boolean;

function isPlus(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+';
}

function plusOperands(node: TSESTree.Node): TSESTree.Node[] {
  return isPlus(node) ? [node.left, node.right] : [];
}

function templatePieces(context: Context, node: TSESTree.TemplateLiteral): Piece[] {
  return node.quasis.flatMap((quasi, index) => {
    const text = { text: quasi.value.cooked ?? '' };
    const value = node.expressions[index];
    return value === undefined ? [text] : [text, classify(context, value)];
  });
}

function concatPieces(context: Context, node: TSESTree.BinaryExpression): Piece[] | undefined {
  const leaves = [...depthFirst(node, plusOperands)].filter((leaf) => !isPlus(leaf));
  const hasText = leaves.some(
    (leaf) => stringValue(leaf) !== undefined || leaf.type === AST_NODE_TYPES.TemplateLiteral,
  );
  return hasText ? leaves.map((leaf) => classify(context, leaf)) : undefined;
}

function methodPieces(
  context: Context,
  node: TSESTree.CallExpression,
  isFormatCall: (call: TSESTree.CallExpression) => boolean,
): Piece[] | undefined {
  const { callee } = node;
  if (isFormatCall(node)) {
    return node.arguments.map((part) => classify(context, part));
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const name = memberName(callee);
  const list = unwrapped(callee.object);
  if (name === 'concat') {
    return [callee.object, ...node.arguments].map((part) => classify(context, part));
  }
  if (name === 'join' && list.type === AST_NODE_TYPES.ArrayExpression) {
    return list.elements.map((part) => classify(context, part ?? undefined));
  }
  if ((name === 'replace' || name === 'replaceAll') && node.arguments.length === 2) {
    return [callee.object, node.arguments[1]].map((part) => classify(context, part));
  }
  return undefined;
}

export function compositionKind(node: TSESTree.Node): string {
  const kinds: Readonly<Record<string, string>> = {
    TemplateLiteral: 'a template literal',
    BinaryExpression: 'concatenation',
    AssignmentExpression: 'concatenation',
  };
  return kinds[node.type] ?? 'a string method';
}

export function piecesOf(
  context: Context,
  node: TSESTree.Node,
  isFormatCall: (call: TSESTree.CallExpression) => boolean,
): Piece[] | undefined {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0 ? undefined : templatePieces(context, node);
  }
  if (isPlus(node)) {
    return concatPieces(context, node);
  }
  return node.type === AST_NODE_TYPES.CallExpression
    ? methodPieces(context, node, isFormatCall)
    : undefined;
}

export function hasRuntimeValue(pieces: readonly Piece[] | undefined): boolean {
  return pieces?.some((piece) => piece.node !== undefined) === true;
}

function runtimePrefixes(pieces: readonly Piece[]): Prefix[] {
  return pieces.flatMap((piece, index) =>
    piece.node === undefined
      ? []
      : [
          {
            before: pieces
              .slice(0, index)
              .map((part) => part.text ?? DYNAMIC)
              .join(''),
            after: pieces[index + 1]?.text ?? '',
          },
        ],
  );
}

const SINK_TESTS: Readonly<Record<string, SinkTest>> = {
  raw: () => true,
  clause: (_text, prefixes) =>
    prefixes.some(
      ({ before }) => VALUE_POSITION.test(before) || FRAGMENT_BEFORE_VALUE.test(before),
    ),
  order: (_text, prefixes) => prefixes.some(({ after }) => !after.startsWith('.')),
  query: (text, prefixes) =>
    LOOSE_STATEMENT.test(text) || prefixes.some(({ before }) => FRAGMENT_BEFORE_VALUE.test(before)),
};

export function looksLikeSql(pieces: readonly Piece[], sink: string | undefined): boolean {
  const text = pieces.map((piece) => piece.text ?? DYNAMIC).join('');
  const sinkTest = sink === undefined ? undefined : SINK_TESTS[sink];
  return (
    STRONG_STATEMENT.test(text) ||
    (sinkTest !== undefined && sinkTest(text, runtimePrefixes(pieces)))
  );
}
