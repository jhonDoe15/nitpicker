export const GRADLE_PRESETS = ['java', 'kotlin'];

export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);

const STYLE_TOOLS = new Map([
  ['python', ['ruff', 'black', 'pyright', 'mypy', 'mutmut']],
  ['kotlin', ['ktlint', 'ktfmt', 'detekt']],
]);

export function styleToolsOf(preset) {
  return STYLE_TOOLS.get(preset) ?? [];
}

function styleToolNames() {
  return [...STYLE_TOOLS.values()].flat();
}

export function precedenceToolNames() {
  return [...PROJECT_TOOL_CONFIGS.keys(), ...styleToolNames()];
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
  'comments',
  'test-runtime',
];
