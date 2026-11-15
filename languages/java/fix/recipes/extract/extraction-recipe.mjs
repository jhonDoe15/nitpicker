import { readJavaExtractions } from '../../../adapters/near-duplicates/jvm-trees.mjs';

const JAVA_FILE = /\.java$/u;
const NOT_MAIN_SOURCE_SET = /(?:^|\/)src\/(?!main\/)[^/]+\//u;
const GENERATED =
  /(?:^|\/)(?:(?:build|target|out)\/|generated-(?:test-)?sources\/|generated\/(?:java|kotlin|sources)\/)/u;
const RULE = 'near-duplicate';

function eligible({ path: name }, isExcepted) {
  return (
    JAVA_FILE.test(name) &&
    !NOT_MAIN_SOURCE_SET.test(name) &&
    !GENERATED.test(name) &&
    !isExcepted(RULE, name)
  );
}

export function extractionRecipe({ id, mode }) {
  return {
    id,
    rules: [{ tool: 'structure', rule: RULE }],
    presets: ['java'],
    scope: mode === 'whole' ? 'project' : 'file',
    safety: 'review',
    accepts: (name) => mode === 'whole' && JAVA_FILE.test(name),
    plan({ files, projectRoot, inputs = {} }) {
      const isExcepted = inputs.isExcepted ?? (() => false);
      const texts = Object.fromEntries(
        files
          .filter((file) => eligible(file, isExcepted))
          .map(({ path: name, text }) => [name, text]),
      );
      return readJavaExtractions(projectRoot, texts, mode);
    },
  };
}
