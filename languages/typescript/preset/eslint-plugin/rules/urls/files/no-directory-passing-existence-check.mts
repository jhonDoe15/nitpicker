import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { syntaxChildren } from '../../decided/syntax.mts';
import {
  ancestorsOf,
  contains,
  depthFirst,
  nameOf,
  type SourceCode,
} from '../../typed/node-views.mts';
import {
  isCallExpression,
  isCallback,
  isFunction,
  type Callback,
  operandsOf,
  unwrapOf,
} from '../../typed/syntax-views.mts';
import { statementsAfter } from '../following-statements.mts';
import { existenceCheckedPath, isConfiguredPath, readCallPath } from './file-calls.mts';

type RuleContext = Readonly<TSESLint.RuleContext<'directory', []>>;

const KIND_CHECKS = /\b(?:statSync|lstatSync|stat|lstat|isFile|isDirectory)\b/u;
const CHAIN_READERS = new Set(['map', 'flatMap', 'forEach']);
const EXITS = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.BreakStatement,
]);

function exits(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.BlockStatement
    ? node.body.some((statement) => EXITS.has(statement.type))
    : EXITS.has(node.type);
}

function isHandled(read: TSESTree.Node): boolean {
  return ancestorsOf(read).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.TryStatement &&
      ancestor.handler !== null &&
      contains(ancestor.block, read),
  );
}

function methodName(node: TSESTree.Node): string {
  return node.type === AST_NODE_TYPES.MemberExpression ? (nameOf(node.property) ?? '') : '';
}

function filteredCallback(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  const source = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  return CHAIN_READERS.has(methodName(callee)) &&
    source?.type === AST_NODE_TYPES.CallExpression &&
    methodName(source.callee) === 'filter'
    ? source.arguments[0]
    : undefined;
}

function negatedExistence(test: TSESTree.Node): TSESTree.Node | undefined {
  return test.type === AST_NODE_TYPES.UnaryExpression && test.operator === '!'
    ? existenceCheckedPath(test.argument)
    : undefined;
}

function awaitedExistence(expression: TSESTree.Node): TSESTree.Node | undefined {
  return expression.type === AST_NODE_TYPES.AwaitExpression
    ? existenceCheckedPath(expression)
    : undefined;
}

type FilterGuard = { readonly parameter: TSESTree.Node; readonly reader: Callback };

function filterGuard(
  sourceCode: SourceCode,
  node: TSESTree.CallExpression,
): FilterGuard | undefined {
  const filter = filteredCallback(node);
  const reader = node.arguments[0];
  if (filter === undefined || reader === undefined || !isCallback(reader)) {
    return undefined;
  }
  const [parameter] = reader.params;
  const probe =
    filter.type === AST_NODE_TYPES.Identifier
      ? filter.name
      : isFunction(filter) && filter.body.type !== AST_NODE_TYPES.BlockStatement
        ? sourceCode.getText(filter.body)
        : '';
  const guarded =
    /^(?:existsSync|pathExistsSync)$/u.test(probe) ||
    /^(?:fs\.)?(?:existsSync|pathExistsSync)\(\w+\)$/u.test(probe);
  return guarded && parameter?.type === AST_NODE_TYPES.Identifier
    ? { parameter, reader }
    : undefined;
}

type ReadCheck = {
  readonly context: RuleContext;
  readonly reported: Set<TSESTree.Node>;
  readonly guarded: TSESTree.Node;
  readonly path: TSESTree.Node;
};

function readsOf(sourceCode: SourceCode, root: TSESTree.Node, text: string) {
  return [...depthFirst<TSESTree.Node>(root, syntaxChildren)]
    .filter(isCallExpression)
    .filter((call) => {
      const path = readCallPath(call);
      return path !== undefined && sourceCode.getText(path) === text;
    });
}

function reportReads(found: ReadCheck, region: readonly TSESTree.Node[]) {
  const { context, reported, guarded, path } = found;
  const { sourceCode } = context;
  const scope = ancestorsOf(guarded).find(isFunction) ?? sourceCode.ast;
  const text = sourceCode.getText(path);
  if (KIND_CHECKS.test(sourceCode.getText(scope)) || !isConfiguredPath(context, path)) {
    return;
  }
  for (const read of region.flatMap((part) => readsOf(sourceCode, part, text))) {
    if (!isHandled(read) && !reported.has(read)) {
      reported.add(read);
      context.report({ node: read, messageId: 'directory' });
    }
  }
}

export const rule: TSESLint.RuleModule<'directory'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a file read guarded by an existence check to check that the path is a file',
    },
    schema: [],
    messages: {
      directory:
        'An existence check is true for a directory, so this read throws EISDIR when a folder ' +
        'has the expected name. Check `statSync(path, { throwIfNoEntry: false })?.isFile()` ' +
        'instead, or read inside a `try` that handles `ENOENT` and `EISDIR`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const reported = new Set<TSESTree.Node>();

    const check = (guarded: TSESTree.Node, path: TSESTree.Node, region: readonly TSESTree.Node[]) =>
      reportReads({ context, reported, guarded, path }, region);

    function guardedRegion(test: TSESTree.Node, region: readonly TSESTree.Node[]) {
      for (const part of operandsOf(unwrapOf(test, [AST_NODE_TYPES.TSNonNullExpression]), '&&')) {
        const path = existenceCheckedPath(part);
        if (path !== undefined) {
          check(part, path, region);
        }
      }
    }

    return {
      IfStatement(node: TSESTree.IfStatement) {
        guardedRegion(node.test, [node.consequent]);
        const path = negatedExistence(node.test);
        if (path !== undefined && exits(node.consequent)) {
          check(node.test, path, statementsAfter(node));
        }
      },
      ConditionalExpression: (node: TSESTree.ConditionalExpression) =>
        guardedRegion(node.test, [node.consequent]),
      LogicalExpression: (node: TSESTree.LogicalExpression) => {
        if (node.operator === '&&') {
          guardedRegion(node.left, [node.right]);
        }
      },
      ExpressionStatement(node: TSESTree.ExpressionStatement) {
        const path = awaitedExistence(node.expression);
        if (path !== undefined) {
          check(node, path, statementsAfter(node));
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        const found = filterGuard(sourceCode, node);
        if (found !== undefined) {
          check(node, found.parameter, [found.reader.body]);
        }
      },
    };
  },
};
