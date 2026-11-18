import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment, withOwnLines } from '../text-ranges.mts';

const STATEMENT_LISTS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.StaticBlock,
  AST_NODE_TYPES.SwitchCase,
]);

type Range = readonly [number, number];

type SourceCode = TSESLint.SourceCode;

function within(range: Range, outer: Range): boolean {
  return range[0] >= outer[0] && range[1] <= outer[1];
}

function blockNames(sourceCode: SourceCode, block: TSESTree.BlockStatement): string[] {
  const scope = sourceCode.scopeManager?.acquire(block);
  return scope === null || scope === undefined ? [] : scope.variables.map(({ name }) => name);
}

function usedOutside(sourceCode: SourceCode, name: string, block: Range): boolean {
  const scopes: readonly TSESLint.Scope.Scope[] = sourceCode.scopeManager?.scopes ?? [];
  return scopes.some(
    (scope) =>
      (!within(scope.block.range ?? [0, 0], block) &&
        scope.variables.some((variable) => variable.name === name)) ||
      scope.references.some(
        ({ identifier }) => identifier.name === name && !within(identifier.range ?? [0, 0], block),
      ),
  );
}

function catchless(text: string, statement: TSESTree.TryStatement): CorePlan {
  const end = statement.handler?.range[1] ?? statement.block.range[1];
  return { edits: [{ start: statement.block.range[1], end, text: '' }] };
}

function unwrapped({ text, sourceCode }: CoreRequest, statement: TSESTree.TryStatement): CorePlan {
  const { block } = statement;
  const inner = text.slice(block.range[0] + 1, block.range[1] - 1).trim();
  const [start, end] = statement.range;
  if (inner === '') {
    return { edits: [{ ...withOwnLines(text, { start, end }), text: '' }] };
  }
  const flat =
    STATEMENT_LISTS.has(statement.parent.type) &&
    !blockNames(sourceCode, block).some((name) => usedOutside(sourceCode, name, block.range));
  return { edits: [{ start, end, text: flat ? inner : `{\n${inner}\n}` }] };
}

function withoutCatch(request: CoreRequest): CorePlan {
  const { node, sourceCode } = request;
  const statement =
    node.type === AST_NODE_TYPES.CatchClause
      ? node.parent
      : node.type === AST_NODE_TYPES.TryStatement
        ? node
        : undefined;
  const handler = statement?.handler;
  if (statement === undefined || handler === null || handler === undefined) {
    return { declined: 'the reported code is not a try statement' };
  }
  if (hasComment(sourceCode, { start: statement.block.range[1], end: handler.range[1] })) {
    return { declined: 'the catch clause holds a comment' };
  }
  return statement.finalizer === null
    ? unwrapped(request, statement)
    : catchless(request.text, statement);
}

export const uselessCatchRecipe = coreRuleRecipe({
  id: 'typescript-no-useless-catch',
  rule: 'no-useless-catch',
  plan: withoutCatch,
});
