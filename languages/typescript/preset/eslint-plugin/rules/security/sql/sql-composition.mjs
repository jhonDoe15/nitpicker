import {
  DYNAMIC,
  FRAGMENT_BEFORE_VALUE,
  LOOSE_STATEMENT,
  STRONG_STATEMENT,
  VALUE_POSITION,
} from '../../../../../../../shared/rules/security/sql-text.mjs';
import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security-values.mjs';
import { classify } from './sql-inert.mjs';

function isPlus(node) {
  return node.type === 'BinaryExpression' && node.operator === '+';
}

function plusOperands(node) {
  return isPlus(node) ? [node.left, node.right] : [];
}

function templatePieces(context, node) {
  return node.quasis.flatMap((quasi, index) => {
    const text = { text: quasi.value.cooked ?? '' };
    const value = node.expressions[index];
    return value === undefined ? [text] : [text, classify(context, value)];
  });
}

function concatPieces(context, node) {
  const leaves = [...depthFirst(node, plusOperands)].filter((leaf) => !isPlus(leaf));
  const hasText = leaves.some(
    (leaf) => stringValue(leaf) !== undefined || leaf.type === 'TemplateLiteral',
  );
  return hasText ? leaves.map((leaf) => classify(context, leaf)) : undefined;
}

function methodPieces(context, node, isFormatCall) {
  const callee = node.callee;
  const name = callee.type === 'MemberExpression' ? memberName(callee) : undefined;
  if (isFormatCall(node)) {
    return node.arguments.map((part) => classify(context, part));
  }
  if (name === 'concat') {
    return [callee.object, ...node.arguments].map((part) => classify(context, part));
  }
  if (name === 'join' && unwrapped(callee.object).type === 'ArrayExpression') {
    return unwrapped(callee.object).elements.map((part) => classify(context, part));
  }
  if (['replace', 'replaceAll'].includes(name) && node.arguments.length === 2) {
    return [callee.object, node.arguments[1]].map((part) => classify(context, part));
  }
  return undefined;
}

export function compositionKind(node) {
  const kinds = {
    TemplateLiteral: 'a template literal',
    BinaryExpression: 'concatenation',
    AssignmentExpression: 'concatenation',
  };
  return kinds[node.type] ?? 'a string method';
}

export function piecesOf(context, node, isFormatCall) {
  if (node.type === 'TemplateLiteral') {
    return node.expressions.length === 0 ? undefined : templatePieces(context, node);
  }
  if (isPlus(node)) {
    return concatPieces(context, node);
  }
  return node.type === 'CallExpression' ? methodPieces(context, node, isFormatCall) : undefined;
}

export function hasRuntimeValue(pieces) {
  return pieces?.some((piece) => piece.node !== undefined) === true;
}

function runtimePrefixes(pieces) {
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

const SINK_TESTS = {
  raw: () => true,
  clause: (text, prefixes) =>
    prefixes.some(
      ({ before }) => VALUE_POSITION.test(before) || FRAGMENT_BEFORE_VALUE.test(before),
    ),
  order: (text, prefixes) => prefixes.some(({ after }) => !after.startsWith('.')),
  query: (text, prefixes) =>
    LOOSE_STATEMENT.test(text) || prefixes.some(({ before }) => FRAGMENT_BEFORE_VALUE.test(before)),
};

export function looksLikeSql(pieces, sink) {
  const text = pieces.map((piece) => piece.text ?? DYNAMIC).join('');
  const sinkTest = SINK_TESTS[sink];
  return (
    STRONG_STATEMENT.test(text) ||
    (sinkTest !== undefined && sinkTest(text, runtimePrefixes(pieces)))
  );
}
