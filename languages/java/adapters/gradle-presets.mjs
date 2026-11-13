export const GRADLE_PRESETS = ['java', 'kotlin'];

export const MAVEN_PRESETS = ['java', 'kotlin'];

export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);

export const BUILD_DECLARED_TOOLS = ['spotbugs', 'errorprone', 'pit', 'tests'];

const STYLE_TOOLS = new Map([
  ['python', ['ruff', 'black', 'pyright', 'mypy', 'mutmut', 'coverage', 'tests']],
  ['kotlin', ['ktlint', 'ktfmt', 'detekt']],
  ['go', ['gofumpt', 'goimports', 'staticcheck']],
]);

export function styleToolsOf(preset) {
  return STYLE_TOOLS.get(preset) ?? [];
}

function styleToolNames() {
  return [...STYLE_TOOLS.values()].flat();
}

export function precedenceToolNames() {
  return [
    ...new Set([...PROJECT_TOOL_CONFIGS.keys(), ...BUILD_DECLARED_TOOLS, ...styleToolNames()]),
  ];
}

export const JAVA_TOOLS = [
  'pmd',
  'spotbugs',
  'errorprone',
  'archunit',
  'google-java-format',
  'palantir-java-format',
  'jacoco',
  'checkstyle',
  'crap',
  'duplicates',
  'pit',
  'structure',
  'coupling',
  'javac',
  'forbiddenapis',
  'dependencies',
  'spring',
  'test-runtime',
];
