import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = 'lombok.config';
const SETTING = 'lombok.addLombokGeneratedAnnotation = true';
const SETTING_LINE = /^[ \t]*(?:clear[ \t]+)?lombok\.addLombokGeneratedAnnotation\b.*$/gmu;
const BUILD_FILE = /^(?:pom\.xml|[\w.-]*\.gradle(?:\.kts)?|[\w.-]*\.versions\.toml)$/u;
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.gradle',
  '.idea',
  'build',
  'node_modules',
  'target',
]);

function sortEntry(entry, directory, found) {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
    found.directories.push(file);
  } else if (entry.isFile() && entry.name === CONFIG_FILE) {
    found.configs.push(file);
  } else if (entry.isFile() && BUILD_FILE.test(entry.name)) {
    found.builds.push(file);
  }
}

function walk(projectRoot) {
  const found = { directories: [projectRoot], configs: [], builds: [] };
  for (const directory of found.directories) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      sortEntry(entry, directory, found);
    }
  }
  return found;
}

function usesLombok({ configs, builds }) {
  return configs.length > 0 || builds.some((file) => /lombok/iu.test(readFileSync(file, 'utf8')));
}

function withSetting(text) {
  const replaced = text.replaceAll(SETTING_LINE, SETTING);
  if (replaced !== text) {
    return replaced;
  }
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${SETTING}\n`;
}

export function markLombokGeneratedCode(projectRoot) {
  const found = walk(projectRoot);
  if (!usesLombok(found)) {
    return [];
  }
  const rootConfig = path.join(projectRoot, CONFIG_FILE);
  const configs = found.configs.includes(rootConfig)
    ? found.configs
    : [rootConfig, ...found.configs];
  for (const file of configs) {
    writeFileSync(
      file,
      withSetting(found.configs.includes(file) ? readFileSync(file, 'utf8') : ''),
    );
  }
  return configs.map((file) => path.relative(projectRoot, file));
}
