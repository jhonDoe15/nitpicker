// Files beside which `build` and `target` are Gradle and Maven output, not a package.
export const BUILD_ROOT_FILES = new Set([
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'pom.xml',
]);

const BUILD_FILE =
  /(?:^|\/)(?:[\w.-]+\.gradle(?:\.kts)?|pom\.xml|gradle\.properties|\.mvn\/(?:maven|jvm)\.config)$|(?:^|\/)buildSrc\/.+\.(?:kt|java|groovy)$/u;
const UNDER_MAIN = /(?:^|\/)src\/main\//u;
const TEST_FILES = {
  python: [
    /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.pyi?$/u,
    /(?:^|\/)tests?\/.+\.pyi?$/u,
    /(?:^|\/)conftest\.py$/u,
  ],
  java: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT)\.java$/u],
  kotlin: [/(?:^|\/)src\/(?:test|it|integrationTest)\//u, /(?:Tests?|IT|Spec)\.kt$/u],
};
const PYTHON_COLLECTED = /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/u;

/** Whether a Gradle or Maven build script, build property file or `buildSrc` source. */
export const isBuildFile = (file) => BUILD_FILE.test(file);

/** Whether a Gradle script (the build scripts and everything they apply or compile). */
export const isGradleFile = (file) => isBuildFile(file) && !/pom\.xml$|\.mvn\//u.test(file);

/** Whether a source file is part of the tests: a name or folder that says so, never `src/main`. */
export const isTestFile = (language, file) =>
  !UNDER_MAIN.test(file) && TEST_FILES[language].some((pattern) => pattern.test(file));

/** Whether pytest collects a Python file by default: `test_*.py` or `*_test.py`. */
export const isCollectedPythonFile = (file) => PYTHON_COLLECTED.test(file);

// Files whose every setting belongs to a quality tool, so any change to one is a change to the gate.
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

const matchesAny = (patterns, file) => patterns.some((pattern) => pattern.test(file));

/** Whether a quality tool's own file (ruff.toml, pytest.ini, detekt.yml, config/pmd/...). */
export const isToolConfigFile = (file) =>
  matchesAny(PYTHON_TOOL_FILES, file) || matchesAny(JVM_TOOL_FILES, file);

/**
 * `python` or `jvm` for a source file, a build file or a quality tool's file of that ecosystem,
 * undefined for any other file (TypeScript sources, documents, data).
 */
export function familyOf(file) {
  if (/\.pyi?$/u.test(file) || matchesAny([...PYTHON_TOOL_FILES, PYTHON_SETTINGS], file)) {
    return 'python';
  }
  const jvm = /\.(?:java|kts?|gradle)$/u.test(file) || isBuildFile(file);
  return jvm || matchesAny([...JVM_TOOL_FILES, JVM_SETTINGS], file) ? 'jvm' : undefined;
}
