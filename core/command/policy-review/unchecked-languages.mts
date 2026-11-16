import { existsSync } from 'node:fs';
import {
  checkedLanguages,
  DEFAULT_PRESET,
  LANGUAGES,
  type Language,
} from '../../projects/plan/preset-languages.mts';
import { globMatcher } from '../../../shared/paths/glob.mjs';
import { containedPath } from '../../../shared/paths/contained-path.mjs';

type Request = {
  readonly preset: string | undefined;
  readonly projectRoot: string;
  readonly exclude: readonly string[];
};

type Matcher = { readonly test: (file: string) => boolean };

const matcherOf: (glob: string) => Matcher = globMatcher;
const LISTED_FILES = 3;
const QUIET_FOLDERS = new Set([
  'node_modules',
  'vendor',
  'venv',
  '__pycache__',
  'site-packages',
  'dist',
  'build',
  'target',
  'out',
  'coverage',
  'generated',
  '__generated__',
  'fixtures',
  'testdata',
]);
const QUIET_NAME =
  /(?:\.d\.[cm]?ts|\.config\.[cm]?[jt]sx?|\.gradle\.kts|\.(?:generated|gen|pb)\.[^.]+|_pb2?\.py)$/u;
const TOOL_SCRIPTS = new Set(['setup.py', 'noxfile.py', 'conf.py']);

function isQuiet(file: string): boolean {
  const parts = file.split('/');
  const name = parts.at(-1) ?? '';
  return (
    parts.slice(0, -1).some((part) => part.startsWith('.') || QUIET_FOLDERS.has(part)) ||
    QUIET_NAME.test(name) ||
    TOOL_SCRIPTS.has(name)
  );
}

function ownFolder(projectRoot: string, file: string, markers: readonly string[]): string {
  const folders = file.split('/').slice(0, -1);
  function outside(relative: string): string {
    return `${relative} leaves ${projectRoot}`;
  }
  const owning = folders
    .map((_, index) => folders.slice(0, index + 1).join('/'))
    .find((folder) =>
      markers.some((marker) =>
        existsSync(containedPath(projectRoot, `${folder}/${marker}`, { outside })),
      ),
    );
  return owning ?? '.';
}

function projectAdvice(folders: readonly string[], words: { readonly them: string }): string {
  if (folders.includes('.')) {
    return '';
  }
  const listed = folders.map((folder) => JSON.stringify(folder)).join(', ');
  return (
    `To check ${words.them}, list ${folders.length === 1 ? 'that folder' : 'those folders'} ` +
    `in "projects" of nitpicker.config.json, for example "projects": [".", ${listed}]; `
  );
}

function languageNotice(request: Request, language: Language, files: readonly string[]): string {
  const folders = [
    ...new Set(files.map((file) => ownFolder(request.projectRoot, file, language.markers))),
  ].sort();
  const words =
    files.length === 1 ? { files: 'file is', them: 'it' } : { files: 'files are', them: 'them' };
  const listed = files.slice(0, LISTED_FILES).join(', ');
  const more =
    files.length > LISTED_FILES ? `, and ${String(files.length - LISTED_FILES)} more` : '';
  const advice = projectAdvice(folders, words);
  const leave = `${advice === '' ? 'T' : 't'}o leave ${words.them} unchecked`;
  return (
    `${String(files.length)} changed ${language.name} ${words.files} in a language the ` +
    `${request.preset ?? DEFAULT_PRESET} preset does not check, so nothing checks ${words.them}: ` +
    `${listed}${more}. ${advice}${leave}, list ${words.them} in "exclude" in nitpicker.config.json.`
  );
}

export function uncheckedLanguageNotices(
  changedFiles: readonly string[],
  request: Request,
): readonly string[] {
  const checked = checkedLanguages(request.preset);
  const excluded = request.exclude.map(matcherOf);
  const candidates = changedFiles
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => !(isQuiet(file) || excluded.some((matcher) => matcher.test(file))))
    .sort();
  return LANGUAGES.filter(({ name }) => !checked.includes(name)).flatMap((language) => {
    const files = candidates.filter((file) => language.file.test(file));
    return files.length === 0 ? [] : [languageNotice(request, language, files)];
  });
}
