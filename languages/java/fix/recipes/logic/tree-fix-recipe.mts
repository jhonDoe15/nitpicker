import type { FixFile, FixRecipe, RecipePlan } from '../../../../../core/fix/typed/fix-types.mts';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';

export type Excepted = (rule: string, name: string) => boolean;
type ReadFixes = (
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
) => RecipePlan;
type TreeFix = { readonly id: string; readonly rule: string; readonly read: ReadFixes };

const JVM_FILE = /\.(?:java|kt)$/u;
export const GENERATED =
  /(?:^|\/)(?:(?:build|target|out)\/|generated-(?:test-)?sources\/|generated\/(?:java|kotlin|sources)\/)/u;

export function exceptedOf(inputs: unknown): Excepted {
  const isExcepted = fieldOf(inputs, 'isExcepted');
  return typeof isExcepted === 'function'
    ? (rule, name) => callUntyped(isExcepted, rule, name) === true
    : () => false;
}

function eligible({ path: name }: FixFile, rule: string, isExcepted: Excepted): boolean {
  return JVM_FILE.test(name) && !GENERATED.test(name) && !isExcepted(rule, name);
}

export function treeFixRecipe({ id, rule, read }: TreeFix): FixRecipe {
  return {
    id,
    rules: [{ tool: 'structure', rule }],
    presets: ['java', 'kotlin'],
    scope: 'file',
    safety: 'review',
    plan({ files, projectRoot, inputs }) {
      const isExcepted = exceptedOf(inputs);
      const texts = Object.fromEntries(
        files
          .filter((file) => eligible(file, rule, isExcepted))
          .map(({ path: name, text }) => [name, text]),
      );
      return Object.keys(texts).length === 0 ? { fixes: [] } : read(projectRoot, texts);
    },
  };
}
