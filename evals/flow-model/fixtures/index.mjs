import { ORDER_CONTRACTS, ORDER_INPUTS } from './contracts.mjs';
import { LIMIT_FIXTURES } from './limits.mjs';
import { ORDERING_FIXTURES } from './ordering.mjs';
import { PATH_FIXTURES } from './paths.mjs';

export const FIXTURES = [...ORDERING_FIXTURES, ...PATH_FIXTURES, ...LIMIT_FIXTURES];

export { ORDER_CONTRACTS, ORDER_INPUTS };

export function fixtureNamed(name) {
  const found = FIXTURES.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`flow-model: unknown fixture ${name}`);
  }
  return found;
}
