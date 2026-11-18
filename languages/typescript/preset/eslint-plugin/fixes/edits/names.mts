import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { visibleVariable } from '../support/scope.mts';

const MAX_SUFFIX = 50;

export function globalScopeOf(scope: TSESLint.Scope.Scope): TSESLint.Scope.Scope {
  let current = scope;
  while (current.upper !== null) {
    current = current.upper;
  }
  return current;
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
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current?.set.has(name) === true) {
      return true;
    }
    for (const child of current?.childScopes ?? []) {
      pending.push(child);
    }
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
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix += 1) {
    const name = suffix === 1 ? base : `${base}${String(suffix)}`;
    if (!isTaken(sourceCode, sites, name) && !declaredBelow(scope, name)) {
      return name;
    }
  }
  return undefined;
}
