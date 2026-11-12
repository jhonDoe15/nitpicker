import path from 'node:path';
import * as prettier from 'prettier';
import { readRegistryFile, registryFiles } from './registry-files.mjs';

const KOTLIN = 'languages/java/adapters/kotlin';
const REGISTRY_FOLDER = 'scan/rules';
const RULES_EXPORT = /^export const kotlinSourceRules\b/mu;
const SKIPPED_FOLDERS = new Set(['fixtures', 'test-support', '__tests__']);
const RULES_NAME = /\bkotlinSourceRules\b/u;

/** Where the generated list of the Kotlin source scan's rule modules goes, from the repository root. */
export const KOTLIN_SCAN_REGISTRY = `${KOTLIN}/${REGISTRY_FOLDER}/source-rules.generated.mjs`;

function identifier(file) {
  const name = path.posix.basename(file, '.mjs');
  return `rules-${name}`.replaceAll(/-([a-z0-9])/gu, (_, letter) => letter.toUpperCase());
}

/**
 * The modules of the Kotlin source scan, found from their folders: each module under the Kotlin
 * adapter that exports `kotlinSourceRules`, by path. Two modules with one file name are an error.
 */
export function kotlinScanModules(repositoryRoot) {
  const root = path.join(repositoryRoot, KOTLIN);
  const texts = registryFiles(root, '.mjs', SKIPPED_FOLDERS)
    .filter((file) => !file.endsWith('.generated.mjs') && file !== 'scan/kotlin-scan.mjs')
    .map((file) => [file, readRegistryFile(root, file)])
    .filter(([, text]) => RULES_NAME.test(text));
  const unlisted = texts.filter(([, text]) => !RULES_EXPORT.test(text)).map(([file]) => file);
  if (unlisted.length > 0) {
    throw new Error(`Export kotlinSourceRules as \`export const\` in ${unlisted.join(', ')}`);
  }
  const files = texts.map(([file]) => file);
  const twice = [...Map.groupBy(files, identifier)].filter(([, same]) => same.length > 1);
  if (twice.length > 0) {
    throw new Error(
      `Kotlin scan modules share a name: ${twice.map(([, same]) => same.join(' and ')).join('; ')}`,
    );
  }
  return files;
}

/** The source of the generated module list, as Prettier formats it: an import per module, in path order. */
export async function kotlinScanRegistrySource(repositoryRoot) {
  const files = kotlinScanModules(repositoryRoot);
  const target = path.join(repositoryRoot, KOTLIN_SCAN_REGISTRY);
  const options = (await prettier.resolveConfig(target)) ?? {};
  const imports = files.map(
    (file) =>
      `import { kotlinSourceRules as ${identifier(file)} } from '${path.posix.relative(REGISTRY_FOLDER, file).replace(/^(?!\.)/u, './')}';`,
  );
  const entries = files.map((file) => `  ${identifier(file)},`);
  const text = `${imports.join('\n')}\n\nexport const directoryRules = [\n${entries.join('\n')}\n];\n`;
  return prettier.format(text, { ...options, filepath: target });
}
