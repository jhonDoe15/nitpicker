import { callChain } from './chains.mjs';
import { builderSite } from './builders.mjs';
import { modelSite } from './models.mjs';

export function ormSite(call, kind, orms) {
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
