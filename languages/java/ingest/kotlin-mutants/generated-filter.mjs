import { declaredClassNames, indexMutationFacts } from './facts.mjs';
import { SOURCE_FREE_RULES, SOURCE_RULES } from './rules.mjs';

const RULES = [...SOURCE_FREE_RULES, ...SOURCE_RULES];

export function createGeneratedFilter(facts) {
  const index = indexMutationFacts(facts);
  const declared = declaredClassNames(index);
  return function forMutants(mutants) {
    const siblings = new Set(mutants.map(({ className, method }) => `${className}|${method}`));
    return function filter(mutant, filePath) {
      if (filePath !== undefined && !filePath.endsWith('.kt')) {
        return undefined;
      }
      const file = index.files.get(filePath);
      const cls = file?.classes.get(mutant.className);
      const context = { mutant, file, cls, declared, siblings };
      return RULES.find(([, matches]) => matches(context))?.[0];
    };
  };
}
