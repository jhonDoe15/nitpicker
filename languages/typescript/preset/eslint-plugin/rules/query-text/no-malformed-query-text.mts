import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  OPAQUE,
  isFullQuery as untypedFull,
  queryProblemMessage as untypedMessage,
  queryTextProblem as untypedProblem,
  runTogether as untypedTogether,
} from '../../../../../../shared/rules/query-text/query-text.mjs';
import { isConcatenation } from '../guards/no-unsafe-path-join.mts';
import { stringKey } from '../secrets/secret-nodes.mts';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';

type MessageId = 'malformed';
type Node = TSESTree.Node;
type Problem = { readonly kind: string };

const problemOf: (text: string, options: { complete: boolean }) => Problem | undefined =
  untypedProblem;
const togetherOf: (left: string, right: string) => Problem | undefined = untypedTogether;
const isFull: (text: string) => boolean = untypedFull;
const messageOf: (problem: Problem) => string = untypedMessage;

const FINAL_PARENTS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.Property,
  AST_NODE_TYPES.TaggedTemplateExpression,
]);
const QUERY_CALLS = new Set([
  'query',
  'execute',
  'run',
  'prepare',
  'all',
  'get',
  'exec',
  'raw',
  'queryRaw',
  'executeRaw',
  '$queryRawUnsafe',
  '$executeRawUnsafe',
  'sql',
  'unsafe',
  'one',
  'many',
  'any',
  'none',
]);

function flatten(node: Node): Node[] {
  return isConcatenation(node) ? [...flatten(node.left), ...flatten(node.right)] : [node];
}

function textOf(node: Node): string {
  const plain = stringKey(node);
  if (plain !== undefined) {
    return plain;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis
      .map(
        (quasi, index) =>
          `${quasi.value.cooked ?? ''}${index < node.expressions.length ? OPAQUE : ''}`,
      )
      .join('');
  }
  return OPAQUE;
}

function target(node: Node): { name: string; statement: Node } | undefined {
  const { parent } = node;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return { name: parent.id.name, statement: parent.parent };
  }
  if (
    parent?.type === AST_NODE_TYPES.AssignmentExpression &&
    parent.left.type === AST_NODE_TYPES.Identifier
  ) {
    return { name: parent.left.name, statement: parent.parent };
  }
  return undefined;
}

function nextStatement(statement: Node): Node | undefined {
  const { parent } = statement;
  const list =
    parent?.type === AST_NODE_TYPES.BlockStatement || parent?.type === AST_NODE_TYPES.Program
      ? parent.body
      : [];
  return list[list.indexOf(statement as never) + 1];
}

function isQueryCall(parent: Node): boolean {
  if (parent.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = parent;
  const name =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
      ? callee.property.name
      : callee.type === AST_NODE_TYPES.Identifier
        ? callee.name
        : undefined;
  return name !== undefined && QUERY_CALLS.has(name);
}

function isComplete(node: Node, text: string): boolean {
  const { parent } = node;
  if (parent !== undefined && isQueryCall(parent)) {
    return true;
  }
  if (parent !== undefined && FINAL_PARENTS.has(parent.type)) {
    return isFull(text);
  }
  const assigned = target(node);
  const next = assigned === undefined ? undefined : nextStatement(assigned.statement);
  if (assigned === undefined || next === undefined) {
    return false;
  }
  return ![...depthFirst<Node>(next, nodeChildren)].some(
    (each) => each.type === AST_NODE_TYPES.Identifier && each.name === assigned.name,
  );
}

function adjacentProblem(operands: readonly Node[]): Problem | undefined {
  for (const [index, operand] of operands.entries()) {
    const left = stringKey(operand);
    const right = stringKey(operands[index + 1] ?? operand);
    const problem =
      left !== undefined && right !== undefined && index + 1 < operands.length
        ? togetherOf(left, right)
        : undefined;
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: { description: 'Report query text that is malformed once its literal parts are joined' },
    schema: [],
    messages: { malformed: '{{detail}}' },
  },
  create(context) {
    function check(
      node: Node,
      query: { operands: readonly Node[]; text: string; complete: boolean },
    ) {
      const { operands, text, complete } = query;
      const problem = problemOf(text, { complete }) ?? adjacentProblem(operands);
      if (problem !== undefined) {
        context.report({ node, messageId: 'malformed', data: { detail: messageOf(problem) } });
      }
    }

    return {
      BinaryExpression(node) {
        if (!isConcatenation(node) || (node.parent !== undefined && isConcatenation(node.parent))) {
          return;
        }
        const operands = flatten(node);
        const text = operands.map(textOf).join('');
        check(node, { operands, text, complete: isComplete(node, text) });
      },
      TemplateLiteral(node) {
        if (node.parent !== undefined && isConcatenation(node.parent)) {
          return;
        }
        const text = textOf(node);
        check(node, { operands: [node], text, complete: isComplete(node, text) });
      },
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          !(node.parent !== undefined && isConcatenation(node.parent))
        ) {
          check(node, {
            operands: [node],
            text: node.value,
            complete: isComplete(node, node.value),
          });
        }
      },
    };
  },
};
