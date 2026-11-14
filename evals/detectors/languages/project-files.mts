import type { Family, Language } from '../common/types.mts';

export const BUILD_ROOT_FILES: ReadonlySet<string> = new Set([
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'pom.xml',
]);

const BUILD_FILE = new RegExp(
  [
    String.raw`(?:^|\/)(?:[\w.-]+\.gradle(?:\.kts)?|pom\.xml|gradle\.properties|`,
    String.raw`\.mvn\/(?:maven|jvm)\.config)$|(?:^|\/)buildSrc\/.+\.(?:kt|java|`,
    String.raw`groovy)$`,
  ].join(''),
  'u',
);
const UNDER_MAIN = /(?:^|\/)src\/main\//u;
const TEST_FILES: Readonly<Record<Language, readonly RegExp[]>> = {
  python: [
    /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.pyi?$/u,
    /(?:^|\/)tests?\/.+\.pyi?$/u,
    /(?:^|\/)conftest\.py$/u,
  ],
  java: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT)\.java$/u],
  kotlin: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT|Spec)\.kt$/u],
};
const PYTHON_COLLECTED = /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/u;

export function isBuildFile(file: string): boolean {
  return BUILD_FILE.test(file);
}

export function isGradleFile(file: string): boolean {
  return isBuildFile(file) && !/pom\.xml$|\.mvn\//u.test(file);
}

export function isTestFile(language: Language, file: string): boolean {
  return !UNDER_MAIN.test(file) && TEST_FILES[language].some((pattern) => pattern.test(file));
}

export function isCollectedPythonFile(file: string): boolean {
  return PYTHON_COLLECTED.test(file);
}

const PYTHON_TOOL_FILES = [
  /(?:^|\/)\.?ruff\.toml$/u,
  /(?:^|\/)\.?mypy\.ini$/u,
  /(?:^|\/)pyrightconfig\.json$/u,
  /(?:^|\/)\.basedpyright\//u,
  /(?:^|\/)\.importlinter$/u,
  /(?:^|\/)\.coveragerc$/u,
  /(?:^|\/)pytest\.ini$/u,
  /(?:^|\/)\.flake8$/u,
  /(?:^|\/)\.?pylintrc$/u,
  /(?:^|\/)\.isort\.cfg$/u,
  /(?:^|\/)mutmut_config\.py$/u,
];
const JVM_TOOL_FILES = [
  /(?:^|\/)detekt[\w.-]*\.(?:ya?ml|xml)$/u,
  /(?:^|\/)ktlint[\w.-]*baseline[\w.-]*$/u,
  /(?:^|\/)config\/(?:pmd|checkstyle|detekt|spotbugs|ktlint)\//u,
  /(?:^|\/)(?:checkstyle|pmd|spotbugs)[\w.-]*\.xml$/u,
  /(?:^|\/)archunit\.properties$/u,
];
const PYTHON_SETTINGS = /(?:^|\/)(?:pyproject\.toml|setup\.cfg|tox\.ini)$/u;
const JVM_SETTINGS = /(?:^|\/)\.editorconfig$/u;

function matchesAny(patterns: readonly RegExp[], file: string): boolean {
  return patterns.some((pattern) => pattern.test(file));
}

export function isToolConfigFile(file: string): boolean {
  return matchesAny(PYTHON_TOOL_FILES, file) || matchesAny(JVM_TOOL_FILES, file);
}

export function familyOf(file: string): Family | undefined {
  if (/\.pyi?$/u.test(file) || matchesAny([...PYTHON_TOOL_FILES, PYTHON_SETTINGS], file)) {
    return 'python';
  }
  const jvm = /\.(?:java|kts?|gradle)$/u.test(file) || isBuildFile(file);
  return jvm || matchesAny([...JVM_TOOL_FILES, JVM_SETTINGS], file) ? 'jvm' : undefined;
}
