import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import {
  localValue,
  moduleFactsOf,
  type ModuleFacts,
  type ResolvedValue,
} from './module-facts.mts';

export type FileContext = { readonly sourceCode: SourceCode; readonly filename: string };

const { ScopeType } = TSESLint.Scope;
const moduleScopes = new Set<string>([ScopeType.module, ScopeType.global]);
const factsBySource = new WeakMap<SourceCode, ModuleFacts>();

function currentFacts({ sourceCode, filename }: FileContext): ModuleFacts {
  return cachedValue(factsBySource, sourceCode, () => moduleFactsOf(filename, sourceCode.text));
}

export function moduleValueOf(
  context: FileContext,
  identifier: TSESTree.Identifier | TSESTree.JSXIdentifier,
): ResolvedValue | undefined {
  const variable = variableNamed(context.sourceCode, identifier);
  return variable !== undefined && moduleScopes.has(variable.scope.type)
    ? localValue(currentFacts(context), identifier.name)
    : undefined;
}
