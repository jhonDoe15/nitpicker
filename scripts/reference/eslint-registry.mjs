import path from 'node:path';
import * as prettier from 'prettier';
import { byCodePoint, readRegistryFile, registryFiles } from './registry-files.mjs';

const PLUGIN = 'languages/typescript/preset/eslint-plugin';
const REGISTRY_NAME = 'rules.generated.mjs';
const RULE_EXPORT = /^export const rule\b/mu;
const SKIPPED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__']);
const SKIPPED_FILES = new Set(['index.mjs', REGISTRY_NAME]);

/** Where the generated rule map of nitpicker's ESLint plugin goes, relative to the repository root. */
export const ESLINT_REGISTRY = `${PLUGIN}/${REGISTRY_NAME}`;

const RULE_ID = /^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/u;

function identifier(id) {
  return `rule-${id}`.replaceAll(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function byId(left, right) {
  return byCodePoint(left.id, right.id);
}

function idProblems(rules) {
  const taken = Map.groupBy(rules, ({ id }) => id);
  return [
    ...[...taken].filter(([, same]) => same.length > 1).map(([id]) => `${id} is defined twice`),
    ...rules.filter(({ id }) => !RULE_ID.test(id)).map(({ file }) => `${file} is not kebab-case`),
  ];
}

/**
 * The plugin's rules, found from its folders: each module that exports `rule` is the rule named
 * after its file, which must be kebab-case. Sorted by id; two modules with one name are an error.
 */
export function eslintPluginRules(repositoryRoot) {
  const root = path.join(repositoryRoot, PLUGIN);
  const rules = registryFiles(root, '.mjs', SKIPPED_FOLDERS)
    .filter((file) => !SKIPPED_FILES.has(path.posix.basename(file)))
    .filter((file) => RULE_EXPORT.test(readRegistryFile(root, file)))
    .map((file) => ({ id: path.posix.basename(file, '.mjs'), file: `./${file}` }))
    .toSorted(byId);
  const problems = idProblems(rules);
  if (problems.length > 0) {
    throw new Error(`The ESLint plugin's rule modules have problems: ${problems.join('; ')}`);
  }
  return rules;
}

/** The source of the generated rule map, as Prettier formats it: an import per rule and the map by id. */
export async function eslintRegistrySource(repositoryRoot) {
  const rules = eslintPluginRules(repositoryRoot);
  const target = path.join(repositoryRoot, ESLINT_REGISTRY);
  const options = (await prettier.resolveConfig(target)) ?? {};
  const imports = rules.map(
    ({ id, file }) => `import { rule as ${identifier(id)} } from '${file}';`,
  );
  const entries = rules.map(({ id }) => `  '${id}': ${identifier(id)},`);
  const text = `${imports.join('\n')}\n\nexport const directoryRules = {\n${entries.join('\n')}\n};\n`;
  return prettier.format(text, { ...options, filepath: target });
}
