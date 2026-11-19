import { fieldOf, numberOr } from '../../../../shared/values/readers.mts';
import { declaredClassNames, indexMutationFacts } from './facts.mts';
import { SOURCE_FREE_RULES, SOURCE_RULES } from './rules.mts';
import type { Mutant } from './typed/fact-types.mts';

const RULES = [...SOURCE_FREE_RULES, ...SOURCE_RULES];

function mutantOf(value: unknown): Mutant {
  return {
    className: String(fieldOf(value, 'className')),
    method: String(fieldOf(value, 'method')),
    methodDescription: String(fieldOf(value, 'methodDescription')),
    mutatorName: String(fieldOf(value, 'mutatorName')),
    description: String(fieldOf(value, 'description')),
    line: numberOr(fieldOf(value, 'line'), Number.NaN),
  };
}

export function createGeneratedFilter(
  facts: unknown,
): (mutants: readonly unknown[]) => (mutant: unknown, filePath?: unknown) => string | undefined {
  const index = indexMutationFacts(facts);
  const declared = declaredClassNames(index);
  return function forMutants(mutants) {
    const siblings = new Set(
      mutants.map(mutantOf).map(({ className, method }) => `${className}|${method}`),
    );
    return function filter(mutant, filePath) {
      const sourcePath = typeof filePath === 'string' ? filePath : undefined;
      if (sourcePath !== undefined && !sourcePath.endsWith('.kt')) {
        return undefined;
      }
      const file = sourcePath === undefined ? undefined : index.files.get(sourcePath);
      const known = mutantOf(mutant);
      const cls = file?.classes.get(known.className);
      const context = { mutant: known, file, cls, declared, siblings };
      return RULES.find(([, matches]) => matches(context))?.[0];
    };
  };
}
