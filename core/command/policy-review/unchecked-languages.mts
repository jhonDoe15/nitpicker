import { existsSync } from 'node:fs';
import path from 'node:path';
import { JVM_MARKERS } from '../../projects/discovery/jvm-builds.mjs';
import { PYTHON_PROJECT_MARKERS } from '../../projects/discovery/python-projects.mjs';
import { globMatcher } from '../../../shared/paths/glob.mjs';

type Language = {
  readonly name: string;
  readonly file: RegExp;
  readonly markers: readonly string[];
};
type Request = {
  readonly preset: string | undefined;
  readonly projectRoot: string;
  readonly exclude: readonly string[];
};

const LISTED_FILES = 3;
const SCRIPT_MARKERS = ['package.json'];
const LANGUAGES: readonly Language[] = [
  { name: 'TypeScript', file: /\.(?:ts|tsx|mts|cts)$/u, markers: SCRIPT_MARKERS },
  { name: 'JavaScript', file: /\.(?:js|jsx|mjs|cjs)$/u, markers: SCRIPT_MARKERS },
  { name: 'Python', file: /\.py$/u, markers: PYTHON_PROJECT_MARKERS },
  { name: 'Java', file: /\.java$/u, markers: JVM_MARKERS },
  { name: 'Kotlin', file: /\.kts?$/u, markers: JVM_MARKERS },
  { name: 'Go', file: /\.go$/u, markers: ['go.mod'] },
];
const SCRIPT_LANGUAGES = ['TypeScript', 'JavaScript'];
const CHECKED: Readonly<Record<string, readonly string[]>> = {
  typescript: SCRIPT_LANGUAGES,
  javascript: SCRIPT_LANGUAGES,
  python: ['Python'],
  java: ['Java'],
  kotlin: ['Java', 'Kotlin'],
  go: ['Go'],
};
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

export function presetChecksFile(preset: string | undefined, file: string): boolean {
  const checked = CHECKED[preset ?? 'typescript'] ?? [];
  return LANGUAGES.some(({ name, file: pattern }) => checked.includes(name) && pattern.test(file));
}

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
  for (let depth = 1; depth <= folders.length; depth += 1) {
    const folder = folders.slice(0, depth).join('/');
    if (markers.some((marker) => existsSync(path.join(projectRoot, folder, marker)))) {
      return folder;
    }
  }
  return '.';
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
    `${request.preset ?? 'typescript'} preset does not check, so nothing checks ${words.them}: ` +
    `${listed}${more}. ${advice}${leave}, list ${words.them} in "exclude" in nitpicker.config.json.`
  );
}

export function uncheckedLanguageNotices(
  changedFiles: readonly string[],
  request: Request,
): readonly string[] {
  const checked = CHECKED[request.preset ?? 'typescript'] ?? [];
  const excluded = request.exclude.map((glob) => globMatcher(glob));
  const candidates = changedFiles
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => !isQuiet(file) && !excluded.some((matcher) => matcher.test(file)))
    .sort();
  return LANGUAGES.filter(({ name }) => !checked.includes(name)).flatMap((language) => {
    const files = candidates.filter((file) => language.file.test(file));
    return files.length === 0 ? [] : [languageNotice(request, language, files)];
  });
}
