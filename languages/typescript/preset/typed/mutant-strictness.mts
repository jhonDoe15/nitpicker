import { fieldsOf, parseJson } from '../../../../shared/values/readers.mts';

const MUTANT_STRICTNESS_OPTIONS = new Set([
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
]);

export function withoutMutantStrictness(text: string): string {
  const config = fieldsOf(parseJson(text));
  const compilerOptions = Object.fromEntries(
    Object.entries(fieldsOf(config['compilerOptions'])).filter(
      ([option]) => !MUTANT_STRICTNESS_OPTIONS.has(option),
    ),
  );
  return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
}
