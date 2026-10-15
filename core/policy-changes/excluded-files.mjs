import { existsSync } from 'node:fs';
import path from 'node:path';
import { matcherOf } from './policy-scope.mjs';

const LISTED_FILES = 3;

export function excludedFileNotices({ baseConfig, headConfig, scope, baseProjectRoot }) {
  const baseExcludes = matcherOf(baseConfig.exclude);
  const keptExcludes = matcherOf(
    (headConfig.exclude ?? []).filter((glob) => (baseConfig.exclude ?? []).includes(glob)),
  );
  const brought = scope.checked
    .filter((file) => {
      if (!keptExcludes(file)) {
        return false;
      }
      const basePath = scope.basePathOf(file);
      return basePath === file
        ? !existsSync(path.join(baseProjectRoot, file))
        : !baseExcludes(basePath);
    })
    .sort();
  if (brought.length === 0) {
    return [];
  }
  const listed = brought.slice(0, LISTED_FILES).join(', ');
  const more = brought.length > LISTED_FILES ? `, and ${brought.length - LISTED_FILES} more` : '';
  return [
    `${String(brought.length)} ${brought.length === 1 ? 'file' : 'files'} this change adds or moves under "exclude" in nitpicker.config.json, so nothing checks ${brought.length === 1 ? 'it' : 'them'}: ${listed}${more}. Keep project code out of excluded folders.`,
  ];
}
