import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';

const PLUGIN = 'languages/typescript/preset/eslint-plugin';
const REGISTRY_NAME = 'rules.generated.mjs';
const RULE_EXPORT = /^export const rule\b/mu;
const SKIPPED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__']);
const SKIPPED_FILES = new Set(['index.mjs', REGISTRY_NAME]);

/** Where the generated rule map of nitpicker's ESLint plugin goes, relative to the repository root. */
export const ESLINT_REGISTRY = `${PLUGIN}/${REGISTRY_NAME}`;

function moduleFiles(root) {
  const files = [];
  const pending = [root];
  for (const directory of pending) {
    const items = readdirSync(directory, { withFileTypes: true });
    const folders = items.filter((item) => item.isDirectory() && !SKIPPED_FOLDERS.has(item.name));
    pending.push(...folders.map((item) => path.join(directory, item.name)));
    files.push(...items.filter(isRuleCandidate).map((item) => path.join(directory, item.name)));
  }
  return files;
}

function isRuleCandidate(item) {
  const isModule = item.isFile() && item.name.endsWith('.mjs') && !item.name.endsWith('.test.mjs');
  return isModule && !SKIPPED_FILES.has(item.name);
}

function identifier(id) {
  return id.replaceAll(/-(\p{Ll})/gu, (_, letter) => letter.toUpperCase());
}

/**
 * The plugin's rules, found from its folders: each module that exports `rule` is the rule named
 * after its file. Sorted by id; two modules with one name are an error.
 */
export function eslintPluginRules(repositoryRoot) {
  const root = path.join(repositoryRoot, PLUGIN);
  const rules = moduleFiles(root)
    .filter((file) => RULE_EXPORT.test(readFileSync(file, 'utf8')))
    .map((file) => ({
      id: path.basename(file, '.mjs'),
      file: `./${path.relative(root, file).split(path.sep).join('/')}`,
    }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const taken = Map.groupBy(rules, ({ id }) => id);
  const repeated = [...taken].filter(([, same]) => same.length > 1).map(([id]) => id);
  if (repeated.length > 0) {
    throw new Error(`Two ESLint plugin rule modules share a name: ${repeated.join(', ')}`);
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
