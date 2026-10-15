import { EXCLUDED_PATH_PATTERN, resolveLayoutFor } from '../layout.mjs';

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TOOL_CONFIGURATION = /(?:^|\/)[^/]*\.config\.[cm]?tsx?$/;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//;
const EXCLUDED_FOLDER = new RegExp(EXCLUDED_PATH_PATTERN);
const LISTED_FILES = 3;
const SINGULAR = { files: 'file is', them: 'it', their: 'its folder', list: 'it' };
const PLURAL = { files: 'files are', them: 'them', their: 'their folders', list: 'them' };

export function outsideRootsNotices(changedFiles, headPolicy) {
  const layout = resolveLayoutFor(headPolicy);
  const roots = [...layout.sourceRoots, ...layout.testRoots].map((root) => `${root}/`);
  const outside = [...changedFiles]
    .map((file) => file.replaceAll('\\', '/'))
    .filter(
      (file) =>
        TYPESCRIPT_FILE.test(file) &&
        !DECLARATION_FILE.test(file) &&
        !TOOL_CONFIGURATION.test(file) &&
        !HIDDEN_FOLDER.test(file) &&
        !EXCLUDED_FOLDER.test(file) &&
        !layout.isExcluded(file) &&
        !roots.some((root) => file.startsWith(root)),
    )
    .sort();
  if (outside.length === 0) {
    return [];
  }
  const listed = outside.slice(0, LISTED_FILES).join(', ');
  const more = outside.length > LISTED_FILES ? `, and ${outside.length - LISTED_FILES} more` : '';
  const words = outside.length === 1 ? SINGULAR : PLURAL;
  return [
    `${outside.length} changed TypeScript ${words.files} outside layout.sourceRoots and layout.testRoots, ` +
      `so nothing checks ${words.them}: ${listed}${more}. ` +
      `Add ${words.their} to layout.sourceRoots, or list ${words.list} in "exclude" in nitpicker.config.json to silence this.`,
  ];
}
