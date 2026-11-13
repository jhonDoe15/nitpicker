const GLOBAL_NAMES = [
  /^nitpicker\./u,
  /^package(?:-lock)?\.json$/u,
  /^npm-shrinkwrap\.json$/u,
  /^(?:yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|bun\.lockb?)$/u,
  /^\.(?:npmrc|yarnrc(?:\.yml)?|nvmrc|node-version|tool-versions|python-version)$/u,
  /^[jt]sconfig(?:[.-][^/]*)?\.json$/u,
  /^(?:pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|pytest\.ini|mypy\.ini|\.mypy\.ini|\.coveragerc)$/u,
  /^\.?(?:ruff|pyrightconfig|importlinter|pylintrc)(?:\.[^/]*)?$/u,
  /^(?:requirements|constraints)[^/]*\.(?:txt|in)$/u,
  /^(?:Pipfile|Pipfile\.lock|poetry\.lock|uv\.lock|pdm\.lock|MANIFEST\.in)$/u,
  /^go\.(?:mod|sum|work|work\.sum)$/u,
  /^(?:\.golangci[^/]*|staticcheck\.conf)$/u,
  /^(?:[^/]*\.gradle(?:\.kts)?|gradle\.properties|gradle\.lockfile|libs\.versions\.toml)$/u,
  /^(?:gradlew|gradlew\.bat|mvnw|mvnw\.cmd|pom\.xml)$/u,
  /^(?:Makefile|justfile)$/u,
  /^\.?(?:eslintrc|eslint\.config|prettierrc|prettier\.config|prettierignore|eslintignore)(?:\.[^/]*)?$/u,
  /^\.?(?:editorconfig|jscpd|knip|dependency-cruiser|stryker|stryker\.conf|babelrc|babel\.config)(?:\.[^/]*)?$/u,
  /^(?:vitest|jest|vite|c8rc|nycrc|mocharc)(?:\.[^/]*)?\.(?:[cm]?[jt]s|json|ya?ml|jsonc)$/u,
  /^\.(?:c8rc|nycrc|mocharc)(?:\.[^/]*)?$/u,
  /^(?:detekt|ktlint|checkstyle|pmd|spotbugs)[^/]*\.(?:xml|ya?ml|conf)$/u,
];
const GLOBAL_FOLDERS = new Set(['.nitpicker', '.mvn', 'gradle']);
const ROOT_GLOBAL_FOLDERS = new Set(['config']);

export function isGlobalInput(file) {
  const parts = file.split('/');
  const name = parts.at(-1) ?? '';
  return (
    parts.slice(0, -1).some((folder) => GLOBAL_FOLDERS.has(folder)) ||
    (parts.length > 1 && ROOT_GLOBAL_FOLDERS.has(parts[0])) ||
    GLOBAL_NAMES.some((pattern) => pattern.test(name))
  );
}
