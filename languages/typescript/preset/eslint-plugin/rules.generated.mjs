import { partRules as part1 } from './registry/rules-1.generated.mjs';
import { partRules as part2 } from './registry/rules-2.generated.mjs';

export const directoryRules = {
  ...part1,
  ...part2,
};
