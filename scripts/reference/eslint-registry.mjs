import path from 'node:path';
import * as prettier from 'prettier';
import { byCodePoint, readRegistryFile, registryFiles } from './registry-files.mjs';

const PLUGIN = 'languages/typescript/preset/eslint-plugin';
const REGISTRY_NAME = 'rules.generated.mjs';
const PARTS_FOLDER = 'registry';
const PART_SIZE = 100;
const RULE_EXPORT = /^export const rule\b/mu;
const SKIPPED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__']);
const SKIPPED_FILES = new Set(['index.mjs', REGISTRY_NAME]);

const ESLINT_REGISTRY = `${PLUGIN}/${REGISTRY_NAME}`;

export const ESLINT_REGISTRY_PARTS = `${PLUGIN}/${PARTS_FOLDER}`;

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

async function formatted(repositoryRoot, relativePath, text) {
  const target = path.join(repositoryRoot, relativePath);
  const options = (await prettier.resolveConfig(target)) ?? {};
  return prettier.format(text, { ...options, filepath: target });
}

function partSource(rules) {
  const imports = rules.map(
    ({ id, file }) => `import { rule as ${identifier(id)} } from '.${file}';`,
  );
  const entries = rules.map(({ id }) => `  '${id}': ${identifier(id)},`);
  return `${imports.join('\n')}\n\nexport const partRules = {\n${entries.join('\n')}\n};\n`;
}

function aggregateSource(count) {
  const numbers = Array.from({ length: count }, (_, index) => index + 1);
  const imports = numbers.map(
    (n) => `import { partRules as part${n} } from './${PARTS_FOLDER}/${partName(n)}';`,
  );
  const spreads = numbers.map((n) => `  ...part${n},`);
  return `${imports.join('\n')}\n\nexport const directoryRules = {\n${spreads.join('\n')}\n};\n`;
}

function partName(number) {
  return `rules-${number}.generated.mjs`;
}

/**
 * The sources of the generated rule map, as Prettier formats them, by path from the repository
 * root: parts of at most `PART_SIZE` rules, each an import per rule and a map by id, and the file
 * that merges the parts.
 *
 * @returns {Promise<Map<string, string>>}
 */
export async function eslintRegistrySources(repositoryRoot) {
  const rules = eslintPluginRules(repositoryRoot);
  const parts = Array.from({ length: Math.ceil(rules.length / PART_SIZE) }, (_, index) =>
    rules.slice(index * PART_SIZE, (index + 1) * PART_SIZE),
  );
  const files = parts.map((part, index) => [
    `${PLUGIN}/${PARTS_FOLDER}/${partName(index + 1)}`,
    partSource(part),
  ]);
  const sources = [[ESLINT_REGISTRY, aggregateSource(parts.length)], ...files];
  return new Map(
    await Promise.all(
      sources.map(async ([file, text]) => [file, await formatted(repositoryRoot, file, text)]),
    ),
  );
}
