import { declaredClassNames, indexMutationFacts } from './facts.mjs';
import { SOURCE_FREE_RULES, SOURCE_RULES } from './rules.mjs';

const RULES = [...SOURCE_FREE_RULES, ...SOURCE_RULES];

export function createGeneratedFilter(facts, generatedSources = new Set()) {
  const index = indexMutationFacts(facts);
  const declared = declaredClassNames(index);
  return (mutant, filePath) => {
    const file = index.files.get(filePath);
    const context = {
      mutant,
      file,
      cls: file?.classes.get(mutant.className),
      declared,
      generatedSources,
    };
    return RULES.find(([, matches]) => matches(context))?.[0];
  };
}
