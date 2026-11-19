import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { appendAll } from '../../../../../../shared/lists/lists.mts';
import { scopeChain, type SourceCode } from '../../rules/typed/node-views.mts';
import { visibleVariable } from '../support/scope.mts';

const MAX_SUFFIX = 50;

export function globalScopeOf(scope: TSESLint.Scope.Scope): TSESLint.Scope.Scope {
  return scopeChain(scope).at(-1) ?? scope;
}

function isTaken(sourceCode: SourceCode, sites: readonly TSESTree.Node[], name: string): boolean {
  return sites.some((site) => {
    if (visibleVariable(sourceCode, site, name) !== undefined) {
      return true;
    }
    const global = globalScopeOf(sourceCode.getScope(site));
    return global.through.some((reference) => reference.identifier.name === name);
  });
}

export function declaredBelow(scope: TSESLint.Scope.Scope, name: string): boolean {
  const pending = [scope];
  for (const current of pending) {
    if (current.set.has(name)) {
      return true;
    }
    appendAll(pending, current.childScopes);
  }
  return false;
}

export function freeName(
  sourceCode: SourceCode,
  {
    sites,
    within,
    base,
  }: {
    readonly sites: readonly TSESTree.Node[];
    readonly within: TSESTree.Node;
    readonly base: string;
  },
): string | undefined {
  const scope = sourceCode.getScope(within);
  return Array.from({ length: MAX_SUFFIX }, (_, index) =>
    index === 0 ? base : `${base}${String(index + 1)}`,
  ).find((name) => !(isTaken(sourceCode, sites, name) || declaredBelow(scope, name)));
}
