import { EXCLUDED_PATH_PATTERN, resolveLayoutFor } from '../layout.mjs';

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TOOL_CONFIGURATION = /(?:^|\/)[^/]*\.config\.[cm]?tsx?$/;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//;
const EXCLUDED_FOLDER = new RegExp(EXCLUDED_PATH_PATTERN);
const LISTED_FILES = 3;

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
  const noun = outside.length === 1 ? 'file is' : 'files are';
  return [
    `${outside.length} changed TypeScript ${noun} outside layout.sourceRoots and layout.testRoots, so nothing checks ` +
      `${outside.length === 1 ? 'it' : 'them'}: ${listed}${more}. Add their folder to layout.sourceRoots, or list it in "exclude" in nitpicker.config.json to silence this.`,
  ];
}
