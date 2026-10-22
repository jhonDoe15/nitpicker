import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FEATURE_FILE = '.feature';
const STEP_FOLDERS = ['steps', 'step_defs'];
const ENVIRONMENT = 'environment.py';
const HIDDEN_PREFIX = '.';

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

function hasStepCode(absolute) {
  return (
    existsSync(path.join(absolute, ENVIRONMENT)) ||
    STEP_FOLDERS.some((name) => isDirectory(path.join(absolute, name)))
  );
}

function holdsFeatureFiles(absolute) {
  const pending = [absolute];
  for (const directory of pending) {
    const entries = readdirSync(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.endsWith(FEATURE_FILE))) {
      return true;
    }
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith(HIDDEN_PREFIX))
        .map((entry) => path.join(directory, entry.name)),
    );
  }
  return false;
}

function ancestorFolders(file) {
  const parts = file.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function bddFeatureMatcher(projectRoot) {
  const verdicts = new Map();
  function isBddFolder(folder) {
    if (!verdicts.has(folder)) {
      const absolute = path.join(projectRoot, folder);
      verdicts.set(folder, hasStepCode(absolute) && holdsFeatureFiles(absolute));
    }
    return verdicts.get(folder);
  }
  return (file) => ancestorFolders(file).some((folder) => isBddFolder(folder));
}
