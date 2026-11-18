import type { TSESTree } from '@typescript-eslint/utils';
import { callChain, type CallChain, type OrmKind, type OrmSite } from './chains.mts';
import { builderSite } from './builders.mts';
import { modelSite } from './models.mts';

export type FoundSite = OrmSite & { readonly chain: CallChain };

export function ormSite(
  call: TSESTree.Node,
  kind: OrmKind,
  orms: readonly string[],
): FoundSite | undefined {
  if (orms.length === 0) {
    return undefined;
  }
  const chain = callChain(call);
  const site =
    chain.steps.length === 0
      ? undefined
      : (builderSite(chain, kind, orms) ?? modelSite(chain, kind, orms));
  return site === undefined ? undefined : { ...site, chain };
}
