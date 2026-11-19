import { projectLines } from '../../../project/project-lines.mts';

type Version = readonly [number, number];

const BUILD_FILES = ['*.gradle', '*.gradle.kts', '*.toml', '*pom.xml', '*gradle.properties'];
const MENTIONS = 'kotlin|languageVersion|apiVersion|language-version|api-version';
const COMMENT = /^\s*(?:\/\/|#|\*|<!--)/u;
const NUMBER = String.raw`(\d+)\.(\d+)`;
const DECLARATIONS = [
  new RegExp(String.raw`kotlin\(\s*["'][\w.-]+["']\s*\)\s*version\s*\(?\s*["']${NUMBER}`, 'u'),
  new RegExp(
    String.raw`org\.jetbrains\.kotlin[\w.-]*["']\s*\)?\s*version\s*\(?\s*["']${NUMBER}`,
    'u',
  ),
  new RegExp(String.raw`org\.jetbrains\.kotlin:kotlin-[\w-]+:${NUMBER}`, 'u'),
  new RegExp(
    String.raw`(?<![\w-]|(?<!\bext)\.)kotlin(?:[._-]?(?:version|plugin|jvm|lang))?["']?\s*[=:]\s*["']?${NUMBER}`,
    'iu',
  ),
  new RegExp(String.raw`<kotlin\.(?:compiler\.)?\w*[vV]ersion>\s*${NUMBER}`, 'u'),
  new RegExp(String.raw`\b(?:languageVersion|apiVersion)\b[^\n]*?KOTLIN_(\d+)_(\d+)`, 'u'),
  new RegExp(String.raw`\b(?:languageVersion|apiVersion)\b[^\n]*?["'>]${NUMBER}["'<]`, 'u'),
  new RegExp(String.raw`-(?:language|api)-version\W{1,6}${NUMBER}`, 'u'),
];
const UNREAD = /-(?:language|api)-version\b|kotlin[\w.-]*version\b[^\n]*\d+\.\d+/iu;
const UNKNOWN: Version = [0, 0];
const NON_NULL_EXTREMES: Version = [1, 7];

function versionsIn(line: string): Version[] {
  if (COMMENT.test(line)) {
    return [];
  }
  const read = DECLARATIONS.flatMap((pattern): Version[] => {
    const match = pattern.exec(line);
    return match === null ? [] : [[Number(match[1]), Number(match[2])]];
  });
  return read.length === 0 && UNREAD.test(line) ? [UNKNOWN] : read;
}

function atLeast([major, minor]: Version, [wantedMajor, wantedMinor]: Version): boolean {
  return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

export function declaredKotlinVersions(projectRoot: string | undefined): Version[] | undefined {
  return projectLines(projectRoot, { pattern: MENTIONS, files: BUILD_FILES })?.flatMap(versionsIn);
}

export function hasNonNullExtremes(projectRoot: string | undefined): boolean {
  const versions = declaredKotlinVersions(projectRoot) ?? [];
  return versions.length > 0 && versions.every((version) => atLeast(version, NON_NULL_EXTREMES));
}
