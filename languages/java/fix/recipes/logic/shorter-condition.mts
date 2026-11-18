import { readShorterConditionFixes as untypedReadShorterConditionFixes } from '../../../adapters/near-duplicates/jvm-trees.mjs';
import type { FixFile, FixRecipe, RecipePlan } from '../../../../../core/fix/typed/fix-types.mts';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type Excepted = (rule: string, name: string) => boolean;

const readShorterConditionFixes: (
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
) => RecipePlan = untypedReadShorterConditionFixes;

const JVM_FILE = /\.(?:java|kt)$/u;
const GENERATED =
  /(?:^|\/)(?:(?:build|target|out)\/|generated-(?:test-)?sources\/|generated\/(?:java|kotlin|sources)\/)/u;
const RULE = 'shorter-condition';

function exceptedOf(inputs: unknown): Excepted {
  const isExcepted = fieldOf(inputs, 'isExcepted');
  return typeof isExcepted === 'function'
    ? (rule, name) => callUntyped(isExcepted, rule, name) === true
    : () => false;
}

function eligible({ path: name }: FixFile, isExcepted: Excepted): boolean {
  return JVM_FILE.test(name) && !GENERATED.test(name) && !isExcepted(RULE, name);
}

export const shorterConditionRecipe: FixRecipe = {
  id: 'jvm-shorter-condition',
  rules: [{ tool: 'structure', rule: RULE }],
  presets: ['java', 'kotlin'],
  scope: 'file',
  safety: 'review',
  plan({ files, projectRoot, inputs }) {
    const isExcepted = exceptedOf(inputs);
    const texts = Object.fromEntries(
      files
        .filter((file) => eligible(file, isExcepted))
        .map(({ path: name, text }) => [name, text]),
    );
    return Object.keys(texts).length === 0
      ? { fixes: [] }
      : readShorterConditionFixes(projectRoot, texts);
  },
};
