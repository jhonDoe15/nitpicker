import { ORDER_CONTRACTS, ORDER_INPUTS } from './source.mts';
import type { Fixture } from './source.mts';
import { LIMIT_FIXTURES } from './limits.mts';
import { ORDERING_FIXTURES } from './ordering.mts';
import { PATH_FIXTURES } from './paths.mts';
import { BINDING_FIXTURES } from './regressions/bindings.mts';
import { REGION_FIXTURES } from './regressions/regions.mts';
import { SOUNDNESS_FIXTURES } from './soundness.mts';

export const FIXTURES: readonly Fixture[] = [
  ...ORDERING_FIXTURES,
  ...PATH_FIXTURES,
  ...SOUNDNESS_FIXTURES,
  ...BINDING_FIXTURES,
  ...REGION_FIXTURES,
  ...LIMIT_FIXTURES,
];

export { ORDER_CONTRACTS, ORDER_INPUTS };

export function fixtureNamed(name: string): Fixture {
  const found = FIXTURES.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`flow-model: unknown fixture ${name}`);
  }
  return found;
}
