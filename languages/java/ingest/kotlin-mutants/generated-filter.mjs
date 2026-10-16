import { declaredClassNames, indexMutationFacts } from './facts.mjs';
import { SOURCE_FREE_RULES, SOURCE_RULES } from './rules.mjs';

const RULES = [...SOURCE_FREE_RULES, ...SOURCE_RULES];

export function createGeneratedFilter(facts, generatedSources = new Set()) {
  const index = indexMutationFacts(facts);
  const declared = declaredClassNames(index);
  const siblings = new Set();
  function filter(mutant, filePath) {
    const file = index.files.get(filePath);
    const cls = file?.classes.get(mutant.className);
    const context = { mutant, file, cls, declared, generatedSources, siblings };
    return RULES.find(([, matches]) => matches(context))?.[0];
  }
  function observe(mutants) {
    for (const { className, method } of mutants) {
      siblings.add(`${className}|${method}`);
    }
  }
  return Object.assign(filter, { observe });
}
