import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = 'lombok.config';
const SETTING = 'lombok.addLombokGeneratedAnnotation = true';
const SETTING_LINE =
  /^[ \t]*(?:clear[ \t]+)?lombok\.addLombokGeneratedAnnotation\b.*(?:\r?\n|$)/gmu;
const BUILD_FILE = /^(?:pom\.xml|[\w.-]*\.gradle(?:\.kts)?|[\w.-]*\.toml)$/u;
const LOMBOK_IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?lombok\./mu;
const ALWAYS_SKIPPED = new Set(['.git', '.gradle', '.idea', 'node_modules']);
const BUILD_OUTPUT = new Set(['build', 'target']);

function isSkipped(name, relativeDirectory) {
  return (
    ALWAYS_SKIPPED.has(name) ||
    (BUILD_OUTPUT.has(name) && !relativeDirectory.split(path.sep).includes('src'))
  );
}

function sortEntry(entry, directory, found) {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) {
    if (!isSkipped(entry.name, path.relative(found.root, directory))) {
      found.directories.push(file);
    }
  } else if (entry.name === CONFIG_FILE && (entry.isFile() || entry.isSymbolicLink())) {
    found.configs.push(file);
  } else if (entry.isFile() && BUILD_FILE.test(entry.name)) {
    found.builds.push(file);
  } else if (entry.isFile() && entry.name.endsWith('.java')) {
    found.sources.push(file);
  }
}

function walk(projectRoot) {
  const found = {
    root: projectRoot,
    directories: [projectRoot],
    configs: [],
    builds: [],
    sources: [],
  };
  for (const directory of found.directories) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      sortEntry(entry, directory, found);
    }
  }
  return found;
}

function parentPoms(projectRoot) {
  if (
    !existsSync(path.join(projectRoot, 'pom.xml')) ||
    existsSync(path.join(projectRoot, '.git'))
  ) {
    return [];
  }
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot || !existsSync(path.join(parent, 'pom.xml'))) {
    return [];
  }
  return [path.join(parent, 'pom.xml'), ...parentPoms(parent)];
}

function usesLombok({ root, configs, builds, sources }) {
  const buildFiles = [...builds, ...parentPoms(root)];
  return (
    configs.length > 0 ||
    buildFiles.some((file) => /lombok/iu.test(readFileSync(file, 'utf8'))) ||
    sources.some((file) => LOMBOK_IMPORT.test(readFileSync(file, 'utf8')))
  );
}

function withSetting(text) {
  const lineBreak = text.includes('\r\n') ? '\r\n' : '\n';
  const kept = text.replaceAll(SETTING_LINE, '');
  const separator = kept === '' || kept.endsWith('\n') ? '' : lineBreak;
  return `${kept}${separator}${SETTING}${lineBreak}`;
}

function currentText(file) {
  return existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : '';
}

function rewrite(file) {
  const text = currentText(file);
  rmSync(file, { force: true });
  writeFileSync(file, withSetting(text));
}

function insideLiveCheckout(projectRoot) {
  const git = path.join(projectRoot, '.git');
  if (existsSync(git)) {
    return statSync(git).isDirectory();
  }
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot) {
    return false;
  }
  return insideLiveCheckout(parent);
}

export const LIVE_CHECKOUT_NOTE =
  'Lombok generated-code marking skipped: the project is inside a live Git checkout (a .git directory), ' +
  'and nitpicker only edits lombok.config in the temporary snapshots it analyses.';

export function markLombokGeneratedCode(directory) {
  const projectRoot = path.resolve(directory);
  if (insideLiveCheckout(projectRoot)) {
    return { written: [], note: LIVE_CHECKOUT_NOTE };
  }
  const found = walk(projectRoot);
  if (!usesLombok(found)) {
    return { written: [], note: undefined };
  }
  const rootConfig = path.join(projectRoot, CONFIG_FILE);
  const configs = found.configs.includes(rootConfig)
    ? found.configs
    : [rootConfig, ...found.configs];
  for (const file of configs) {
    rewrite(file);
  }
  return { written: configs.map((file) => path.relative(projectRoot, file)), note: undefined };
}
