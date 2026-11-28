import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  referencesOf,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { isNamedMember, operandsOf, unwrapOf } from '../typed/syntax-views.mts';
import { isListWord, isUnboundedList } from './unbounded-lists.mts';

type MessageIds = 'wholeWrite' | 'wholeRead';

const DATA_SECOND = new Set([
  'writeFileSync',
  'writeFile',
  'appendFileSync',
  'appendFile',
  'writeSync',
]);
const READS = new Set(['readFileSync', 'readFile']);
const READ_WRAPPERS = [AST_NODE_TYPES.AwaitExpression, AST_NODE_TYPES.TSAsExpression];

function dataArgument(call: TSESTree.CallExpression): TSESTree.Node | undefined {
  const name = nameOf(
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.property : call.callee,
  );
  if (DATA_SECOND.has(name ?? '')) {
    return call.arguments[1];
  }
  return name === 'write' && call.callee.type === AST_NODE_TYPES.MemberExpression
    ? call.arguments[0]
    : undefined;
}

function resolved(context: SourceContext, node: TSESTree.Node): TSESTree.Node {
  return resolveConstant(context, node);
}

function pieces(context: SourceContext, data: TSESTree.Node): readonly TSESTree.Node[] {
  const value = resolved(context, data);
  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.expressions.map((expression) => resolved(context, expression));
  }
  return operandsOf(value, '+').map((operand) => resolved(context, operand));
}

function isWholeText(context: SourceContext, piece: TSESTree.Node): boolean {
  if (piece.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const [first] = piece.arguments;
  if (isNamedMember(piece.callee, 'JSON', 'stringify')) {
    return first !== undefined && isUnboundedList(context, first);
  }
  return (
    piece.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(piece.callee.property) === 'join' &&
    isUnboundedList(context, piece.callee.object)
  );
}

function isFileRead(node: TSESTree.Node | undefined): boolean {
  const read = node === undefined ? undefined : unwrapOf(node, READ_WRAPPERS);
  if (read?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = read;
  const name = callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee;
  return READS.has(nameOf(name) ?? '');
}

function readsList(context: SourceContext, parse: TSESTree.CallExpression): boolean {
  const { parent } = parse;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === parse) {
    return isListWord(nameOf(parent.property));
  }
  if (parent.type !== AST_NODE_TYPES.VariableDeclarator) {
    return false;
  }
  const { id } = parent;
  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    return id.properties.some(
      (property) => property.type === AST_NODE_TYPES.Property && isListWord(nameOf(property.key)),
    );
  }
  if (id.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return referencesOf(context, id, id.name).some((reference) => {
    const member = reference.identifier.parent;
    return (
      member.type === AST_NODE_TYPES.MemberExpression &&
      member.object === reference.identifier &&
      isListWord(nameOf(member.property))
    );
  });
}

const FIX =
  'Write the list one element per line (JSON Lines) or in batches, and read it back line by line.';

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow turning a list that grows with the input into one JSON or text string',
    },
    schema: [],
    messages: {
      wholeWrite: `This turns a list that grows with the input into one string before it is written. A string holds at most about 512 million characters, so the call throws "Invalid string length" and the output is lost exactly when it is largest; below that the process holds the whole text next to the objects. ${FIX}`,
      wholeRead: `This reads a file whole and parses it in one piece to get a list that grows with the input. The process holds the whole text next to the parsed objects, and a file past about 512 million characters cannot be read into one string at all. ${FIX}`,
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isNamedMember(node.callee, 'JSON', 'parse')) {
          if (isFileRead(node.arguments[0]) && readsList(context, node)) {
            context.report({ node, messageId: 'wholeRead' });
          }
          return;
        }
        const data = dataArgument(node);
        if (
          data !== undefined &&
          pieces(context, data).some((piece) => isWholeText(context, piece))
        ) {
          context.report({ node: data, messageId: 'wholeWrite' });
        }
      },
    };
  },
};
