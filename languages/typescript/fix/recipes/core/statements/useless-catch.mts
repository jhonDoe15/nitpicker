import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { CORE_RECIPES } from '../core-recipe-facts.mts';
import { coreRuleRecipe, type CorePlan, type CoreRequest } from '../core-rule-recipe.mts';
import { hasComment, isInStatementList, withOwnLines } from '../text-ranges.mts';

type Range = readonly [number, number];

const CONTINUING = /^[([`+\-/]/u;

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
      (!within(scope.block.range, block) &&
        scope.variables.some((variable) => variable.name === name)) ||
      scope.references.some(
        ({ identifier }) => identifier.name === name && !within(identifier.range, block),
      ),
  );
}

function catchless(statement: TSESTree.TryStatement): CorePlan {
  const end = statement.handler?.range[1] ?? statement.block.range[1];
  return { edits: [{ start: statement.block.range[1], end, text: '' }] };
}

function joinsNeighbours(text: string, inner: string, [start, end]: Range): boolean {
  const before = text.slice(0, start).trimEnd();
  const after = text.slice(end).trimStart();
  return (
    (CONTINUING.test(inner) && before !== '' && !/[;{}:]$/u.test(before)) ||
    (!inner.endsWith(';') && CONTINUING.test(after))
  );
}

function unwrapped({ text, sourceCode }: CoreRequest, statement: TSESTree.TryStatement): CorePlan {
  const { block } = statement;
  const inner = text.slice(block.range[0] + 1, block.range[1] - 1).trim();
  const [start, end] = statement.range;
  const inList = isInStatementList(statement);
  if (inner === '') {
    return inList
      ? { edits: [{ ...withOwnLines(text, { start, end }), text: '' }] }
      : { edits: [{ start, end, text: '{}' }] };
  }
  const flat =
    inList &&
    !joinsNeighbours(text, inner, statement.range) &&
    !blockNames(sourceCode, block).some((name) => usedOutside(sourceCode, name, block.range));
  return { edits: [{ start, end, text: flat ? inner : `{\n${inner}\n}` }] };
}

function tryStatementOf(node: TSESTree.Node): TSESTree.TryStatement | undefined {
  if (node.type === AST_NODE_TYPES.CatchClause) {
    return node.parent;
  }
  return node.type === AST_NODE_TYPES.TryStatement ? node : undefined;
}

function withoutCatch(request: CoreRequest): CorePlan {
  const { node, sourceCode } = request;
  const statement = tryStatementOf(node);
  const handler = statement?.handler;
  if (statement === undefined || handler === null || handler === undefined) {
    return { declined: 'the reported code is not a try statement' };
  }
  if (
    hasComment(sourceCode, { start: statement.range[0], end: statement.block.range[0] }) ||
    hasComment(sourceCode, { start: statement.block.range[1], end: handler.range[1] })
  ) {
    return { declined: 'the catch clause holds a comment' };
  }
  return statement.finalizer === null ? unwrapped(request, statement) : catchless(statement);
}

export const uselessCatchRecipe = coreRuleRecipe(CORE_RECIPES.uselessCatch, withoutCatch);
