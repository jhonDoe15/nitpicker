import { JVM_MARKERS } from '../discovery/jvm-builds.mjs';
import { PYTHON_PROJECT_MARKERS } from '../discovery/python-projects.mjs';

export type Language = {
  readonly name: string;
  readonly file: RegExp;
  readonly markers: readonly string[];
};

export const DEFAULT_PRESET = 'typescript';
const SCRIPT_MARKERS = ['package.json'];
export const LANGUAGES: readonly Language[] = [
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
export function checkedLanguages(preset: string | undefined): readonly string[] {
  return CHECKED[preset ?? DEFAULT_PRESET] ?? [];
}

export function presetChecksFile(preset: string | undefined, file: string): boolean {
  const checked = checkedLanguages(preset);
  return LANGUAGES.some(({ name, file: pattern }) => checked.includes(name) && pattern.test(file));
}
