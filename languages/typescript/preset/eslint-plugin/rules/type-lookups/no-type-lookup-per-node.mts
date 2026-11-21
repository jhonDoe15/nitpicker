import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf } from '../typed/node-views.mts';
import { declaredName, isInnerLoopExit } from './lookup-sites.mts';
import { filtersByOuterCollection } from './name-filters.mts';
import { isSyntaxOnly, type TestScope } from './syntax-tests.mts';
import { enclosingWalk, type Walk } from './walk-contexts.mts';

type MessageId = 'beforeTest' | 'beforeNameFilter';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Lookup = { readonly call: TSESTree.CallExpression; readonly method: string };

const LOOKUPS = new Set(['getSymbolAtLocation', 'getTypeAtLocation', 'getTypeOfSymbolAtLocation']);
const WALK_WORDS = { listener: 'lint listener', visitor: 'tree visitor', loop: 'loop' } as const;

function lookupOf(call: TSESTree.CallExpression): Lookup | undefined {
  const { callee } = call;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    LOOKUPS.has(callee.property.name)
    ? { call, method: callee.property.name }
    : undefined;
}

function innermost(statement: TSESTree.Statement): TSESTree.Statement {
  const chain = chainOf<TSESTree.Statement>(statement, (current) =>
    current.type === AST_NODE_TYPES.BlockStatement && current.body.length === 1
      ? current.body[0]
      : undefined,
  );
  return chain.at(-1) ?? statement;
}

function isExit(statement: TSESTree.Statement): boolean {
  const inner = innermost(statement);
  return (
    inner.type === AST_NODE_TYPES.ReturnStatement || inner.type === AST_NODE_TYPES.ContinueStatement
  );
}

function exitValue(statement: TSESTree.Statement): TSESTree.Node | undefined {
  const inner = innermost(statement);
  return inner.type === AST_NODE_TYPES.ReturnStatement ? (inner.argument ?? undefined) : undefined;
}

function followingStatements(declarator: TSESTree.VariableDeclarator): TSESTree.Statement[] {
  const declaration = declarator.parent;
  const block = declaration.parent;
  if (block.type !== AST_NODE_TYPES.BlockStatement && block.type !== AST_NODE_TYPES.Program) {
    return [];
  }
  const statements: readonly TSESTree.Node[] = block.body;
  const index = statements.indexOf(declaration);
  return block.body
    .slice(index + 1)
    .filter((statement) => statement.type !== AST_NODE_TYPES.ImportDeclaration);
}

function isCheapDeclaration(scope: TestScope, statement: TSESTree.Statement): boolean {
  return (
    statement.type === AST_NODE_TYPES.VariableDeclaration &&
    statement.kind === 'const' &&
    statement.declarations.every(
      ({ id, init }) =>
        id.type === AST_NODE_TYPES.Identifier && init !== null && isSyntaxOnly(scope, init),
    )
  );
}

function earlyTestAfter(scope: TestScope, declarator: TSESTree.VariableDeclarator): boolean {
  if (isInnerLoopExit(declarator, scope.walk.body)) {
    return false;
  }
  for (const statement of followingStatements(declarator)) {
    if (isCheapDeclaration(scope, statement)) {
      continue;
    }
    if (statement.type !== AST_NODE_TYPES.IfStatement || statement.alternate !== null) {
      return false;
    }
    const value = exitValue(statement.consequent);
    return (
      isExit(statement.consequent) &&
      isSyntaxOnly(scope, statement.test) &&
      (value === undefined || isSyntaxOnly(scope, value))
    );
  }
  return false;
}

function findingFor(context: Context, walk: Walk, { call, method }: Lookup) {
  const declarator = declaredName(call);
  const scope: TestScope = {
    context,
    walk,
    lookupName: declarator?.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : undefined,
  };
  if (declarator !== undefined && earlyTestAfter(scope, declarator)) {
    return { messageId: 'beforeTest' as const, method };
  }
  return method === 'getSymbolAtLocation' && filtersByOuterCollection(context, scope, call)
    ? { messageId: 'beforeNameFilter' as const, method }
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Test a node syntax-only before asking the type checker about it in a tree walk',
    },
    schema: [],
    messages: {
      beforeTest:
        '`{{method}}` runs in this {{walk}} before a syntax-only test that can skip the node without using the answer, so every node the test skips is type-checked for nothing. Type lookups are lazy, so asking about every node type-checks most of the program. Move the test before the lookup. An exception fits only when nearly every visited node passes the test.',
      beforeNameFilter:
        "`{{method}}` runs for every node this {{walk}} reaches, and its answer is only looked up in a collection built before the walk, so the wanted names are known up front. Type lookups are lazy, so asking about every node type-checks most of the program. Keep a set of the wanted names and test the node's name against it before the lookup. An exception fits only when nearly every visited node has a wanted name.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const lookup = lookupOf(node);
        const walk = lookup === undefined ? undefined : enclosingWalk(node);
        if (lookup === undefined || walk === undefined) {
          return;
        }
        const finding = findingFor(context, walk, lookup);
        if (finding !== undefined) {
          context.report({
            node,
            messageId: finding.messageId,
            data: { method: finding.method, walk: WALK_WORDS[walk.kind] },
          });
        }
      },
    };
  },
};
