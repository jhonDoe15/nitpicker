import { readJavaExtractions as untypedReadJavaExtractions } from '../../../adapters/near-duplicates/jvm-trees.mts';
import type { FixFile, FixRecipe, RecipePlan } from '../../../../../core/fix/typed/fix-types.mts';
import { exceptedOf, GENERATED, type Excepted } from '../logic/tree-fix-recipe.mts';

type Extraction = { readonly id: string; readonly mode: 'whole' | 'partial' };

const readJavaExtractions: (
  projectRoot: string | undefined,
  texts: Readonly<Record<string, string>>,
  mode: string,
) => RecipePlan = untypedReadJavaExtractions;

const JAVA_FILE = /\.java$/u;
const NOT_MAIN_SOURCE_SET = /(?:^|\/)src\/(?!main\/)[^/]+\//u;
const RULE = 'near-duplicate';

function eligible({ path: name }: FixFile, isExcepted: Excepted): boolean {
  return (
    JAVA_FILE.test(name) &&
    !NOT_MAIN_SOURCE_SET.test(name) &&
    !GENERATED.test(name) &&
    !isExcepted(RULE, name)
  );
}

export function extractionRecipe({ id, mode }: Extraction): FixRecipe {
  return {
    id,
    rules: [{ tool: 'structure', rule: RULE }],
    presets: ['java'],
    scope: mode === 'whole' ? 'project' : 'file',
    safety: 'review',
    accepts(name) {
      return mode === 'whole' && JAVA_FILE.test(name);
    },
    plan({ files, projectRoot, inputs }) {
      const isExcepted = exceptedOf(inputs);
      const texts = Object.fromEntries(
        files
          .filter((file) => eligible(file, isExcepted))
          .map(({ path: name, text }) => [name, text]),
      );
      return readJavaExtractions(projectRoot, texts, mode);
    },
  };
}
