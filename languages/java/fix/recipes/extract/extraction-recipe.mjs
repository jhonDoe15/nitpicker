import { readJavaExtractions } from '../../../adapters/near-duplicates/jvm-trees.mjs';

const JAVA_FILE = /\.java$/u;
const NOT_MAIN_SOURCE_SET = /(?:^|\/)src\/(?!main\/)[^/]+\//u;
const RULE = 'near-duplicate';

function eligible({ path: name }, isExcepted) {
  return JAVA_FILE.test(name) && !NOT_MAIN_SOURCE_SET.test(name) && !isExcepted(RULE, name);
}

export function extractionRecipe({ id, mode }) {
  return {
    id,
    rules: [{ tool: 'structure', rule: RULE }],
    presets: ['java'],
    scope: 'file',
    safety: 'review',
    plan({ files, projectRoot, inputs = {} }) {
      const isExcepted = inputs.isExcepted ?? (() => false);
      const texts = Object.fromEntries(
        files
          .filter((file) => eligible(file, isExcepted))
          .map(({ path: name, text }) => [name, text]),
      );
      const found = readJavaExtractions(projectRoot, texts, mode);
      return {
        fixes: Object.entries(found).flatMap(([name, { fixes }]) =>
          fixes.map(({ finding, edits }) => ({
            finding,
            edits: edits.map((edit) => ({ type: 'replace', path: name, ...edit })),
          })),
        ),
        notes: Object.values(found).flatMap(({ notes }) => notes),
      };
    },
  };
}
