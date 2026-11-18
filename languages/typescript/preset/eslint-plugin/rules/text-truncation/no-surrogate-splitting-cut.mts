import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../analysis/constant-resolution.mts';
import { typeServices } from '../security/security-values.mts';
import { ancestorsOf } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { guardBound } from './length-guards.mts';

const CUTS = new Set(['slice', 'substring', 'substr']);
const CODE_POINT_AWARE =
  /Surrogate|charCodeAt|codePointAt|0x[dD][89a-fA-F]|\\u[dD][89a-fA-F]|Segmenter|Array\.from|\[\.\.\./u;
const ASCII_NAME = /hash|hex|base64|uuid|sha\d*|digest|slug|token|\bid\b|Id\b/iu;
const ELLIPSIS = /^(?:\.{3}|…)/u;
const MAX_FIRST_CHARACTERS = 1;

function cutCall(
  node: TSESTree.CallExpression,
): { receiver: TSESTree.Node; end: TSESTree.Node } | undefined {
  const { callee } = node;
  const [start, end] = node.arguments;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CUTS.has(callee.property.name) &&
    node.arguments.length === 2 &&
    start?.type === AST_NODE_TYPES.Literal &&
    start.value === 0 &&
    end !== undefined &&
    end.type !== AST_NODE_TYPES.SpreadElement &&
    end.type !== AST_NODE_TYPES.UnaryExpression &&
    !(end.type === AST_NODE_TYPES.Literal && Number(end.value) <= MAX_FIRST_CHARACTERS)
    ? { receiver: callee.object, end }
    : undefined;
}

function isEllipsisJoined(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent?.type === AST_NODE_TYPES.BinaryExpression && parent.operator === '+') {
    const other = parent.left === node ? parent.right : parent.left;
    return (
      other.type === AST_NODE_TYPES.Literal &&
      typeof other.value === 'string' &&
      ELLIPSIS.test(other.value)
    );
  }
  return (
    parent?.type === AST_NODE_TYPES.TemplateLiteral &&
    parent.quasis.some(
      (quasi) =>
        ELLIPSIS.test(quasi.value.cooked ?? '') || /(?:\.{3}|…)$/u.test(quasi.value.cooked ?? ''),
    )
  );
}

export const rule: TSESLint.RuleModule<'surrogateCut'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow truncating text by UTF-16 code units where the cut can split a surrogate pair',
    },
    schema: [],
    messages: {
      surrogateCut:
        'This cuts text at a length counted in UTF-16 code units, so a cut between the two halves of a surrogate pair (an emoji, many CJK characters) leaves a lone surrogate that renders as a replacement character and fails strict UTF-8 encoding. Cut on code points (`Array.from(text).slice(0, max).join("")`) or on grapheme clusters with `Intl.Segmenter`, or step back over a high surrogate before cutting. Text that is ASCII by construction (ids, hashes, base64) is fine.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function isString(node: TSESTree.Node): boolean {
      const services = typeServices(context);
      if (services === undefined) {
        return false;
      }
      const type = services.program
        .getTypeChecker()
        .getNonNullableType(services.getTypeAtLocation(node));
      return (type.flags & ts.TypeFlags.StringLike) !== 0;
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const cut = cutCall(node);
        if (cut === undefined) {
          return;
        }
        const receiver = sourceCode.getText(cut.receiver);
        const bound = guardBound(node, receiver, sourceCode);
        const scope = ancestorsOf(node).find(
          (ancestor) => isFunctionNode(ancestor) || ancestor.type === AST_NODE_TYPES.Program,
        );
        const typed = typeServices(context) !== undefined;
        if (
          bound === undefined ||
          !sourceCode.getText(cut.end).includes(bound) ||
          ASCII_NAME.test(receiver) ||
          (scope !== undefined && CODE_POINT_AWARE.test(sourceCode.getText(scope))) ||
          (typed ? !isString(cut.receiver) : !isEllipsisJoined(node))
        ) {
          return;
        }
        context.report({ node, messageId: 'surrogateCut' });
      },
    };
  },
};
