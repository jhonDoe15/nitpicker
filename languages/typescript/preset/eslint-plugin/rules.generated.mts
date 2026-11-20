import { partRules as part1 } from './registry/rules-1.generated.mts';
import { partRules as part2 } from './registry/rules-2.generated.mts';
import { partRules as part3 } from './registry/rules-3.generated.mts';

export const directoryRules = {
  ...part1,
  ...part2,
  ...part3,
};
