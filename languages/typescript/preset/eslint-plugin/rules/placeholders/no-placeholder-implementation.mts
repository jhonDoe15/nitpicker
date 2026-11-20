import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  isNonProductionPath,
  placeholderPhrase,
} from '../../../../../../shared/rules/placeholders/placeholder-comments.mts';
import { ancestorsOf, chainOf } from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import { standInShape, type Shape } from './stand-in-shapes.mts';

type Found = { readonly node: TSESTree.Node; readonly shape: Shape };

const STATEMENT_HOLDERS = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.SwitchCase,
]);
const SHAPE_TEXT: Readonly<Record<Shape, string>> = {
  literal: 'it returns a fixed value',
  data: 'it is a fixed list of data',
  delay: 'it only waits',
  copy: 'it passes a value on unchanged',
  empty: 'the function does nothing',
};

function statementAt(code: TSESLint.SourceCode, token: TSESTree.Token): TSESTree.Node | undefined {
  const inner = code.getNodeByRangeIndex(token.range[0]) ?? undefined;
  if (inner === undefined) {
    return undefined;
  }
  return [inner, ...ancestorsOf(inner)].find(
    (node) => node.parent !== undefined && STATEMENT_HOLDERS.has(node.parent.type),
  );
}

function isComment(token: TSESTree.Token): token is TSESTree.Comment {
  return token.type === AST_TOKEN_TYPES.Line || token.type === AST_TOKEN_TYPES.Block;
}

function lastOfRun(code: TSESLint.SourceCode, first: TSESTree.Comment): TSESTree.Comment {
  const run = chainOf(first, (comment) => {
    const next = code.getTokenAfter(comment, { includeComments: true }) ?? undefined;
    return next !== undefined && isComment(next) && next.loc.start.line <= comment.loc.end.line + 1
      ? next
      : undefined;
  });
  return run.at(-1) ?? first;
}

function emptyFunction(
  code: TSESLint.SourceCode,
  before: TSESTree.Token | undefined,
  after: TSESTree.Token,
): Found | undefined {
  if (before?.value !== '{' || after.value !== '}') {
    return undefined;
  }
  const block = code.getNodeByRangeIndex(before.range[0]) ?? undefined;
  return block?.type === AST_NODE_TYPES.BlockStatement && isFunction(block.parent)
    ? { node: block.parent, shape: 'empty' }
    : undefined;
}

function standInAt(
  code: TSESLint.SourceCode,
  token: TSESTree.Token,
  edge: 0 | 1,
): Found | undefined {
  const statement = statementAt(code, token);
  const shape = statement === undefined ? undefined : standInShape(statement);
  return statement !== undefined &&
    shape !== undefined &&
    statement.range[edge] === token.range[edge]
    ? { node: statement, shape }
    : undefined;
}

function standInUnder(code: TSESLint.SourceCode, comment: TSESTree.Comment): Found | undefined {
  const before = code.getTokenBefore(comment) ?? undefined;
  if (before?.loc.end.line === comment.loc.start.line) {
    return standInAt(code, before, 1);
  }
  const last = lastOfRun(code, comment);
  const after = code.getTokenAfter(last) ?? undefined;
  if (after === undefined || after.loc.start.line > last.loc.end.line + 1) {
    return undefined;
  }
  return emptyFunction(code, before, after) ?? standInAt(code, after, 0);
}

export const rule: TSESLint.RuleModule<'placeholder'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report code that a comment calls a stand-in for the real work and that is one by its shape',
    },
    schema: [],
    messages: {
      placeholder:
        'The comment here calls this a stand-in ("{{phrase}}"), and the code is one: {{shape}}. Do the real work, or throw an error that says it is not implemented, so that no caller takes the stand-in for a result. Deleting the comment alone leaves the stand-in in place. An exception fits only for demonstration code that never ships.',
    },
  },
  create(context) {
    if (isNonProductionPath(context.filename)) {
      return {};
    }
    const reported = new Set<TSESTree.Node>();
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const phrase = placeholderPhrase(comment.value);
          const found =
            phrase === undefined ? undefined : standInUnder(context.sourceCode, comment);
          if (phrase !== undefined && found !== undefined && !reported.has(found.node)) {
            reported.add(found.node);
            context.report({
              node: found.node,
              messageId: 'placeholder',
              data: { phrase, shape: SHAPE_TEXT[found.shape] },
            });
          }
        }
      },
    };
  },
};
