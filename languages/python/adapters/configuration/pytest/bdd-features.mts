import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const FEATURE_FILE = '.feature';
const STEP_FOLDERS = ['steps', 'step_defs'];
const ENVIRONMENT = 'environment.py';
const HIDDEN_PREFIX = '.';

export function isDirectory(absolute: string): boolean {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

function hasStepCode(absolute: string): boolean {
  return (
    existsSync(path.join(absolute, ENVIRONMENT)) ||
    STEP_FOLDERS.some((name) => isDirectory(path.join(absolute, name)))
  );
}

function holdsFeatureFiles(absolute: string): boolean {
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

function ancestorFolders(file: string): string[] {
  const parts = file.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function bddFeatureMatcher(projectRoot: string): (file: string) => boolean {
  const verdicts = new Map<string, boolean>();
  function isBddFolder(folder: string): boolean {
    const known = verdicts.get(folder);
    if (known !== undefined) {
      return known;
    }
    const absolute = path.join(projectRoot, folder);
    const verdict = hasStepCode(absolute) && holdsFeatureFiles(absolute);
    verdicts.set(folder, verdict);
    return verdict;
  }
  return (file: string) => ancestorFolders(file).some((folder) => isBddFolder(folder));
}
