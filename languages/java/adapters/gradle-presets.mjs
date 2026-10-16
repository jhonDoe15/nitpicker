export const GRADLE_PRESETS = ['java', 'kotlin'];

export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);

const STYLE_TOOLS = new Map([
  ['python', ['ruff', 'black']],
  ['kotlin', ['ktlint', 'ktfmt', 'detekt']],
]);

const PROJECT_STYLE_FILES = new Map([
  ['ruff', ['.ruff.toml', 'ruff.toml', 'pyproject.toml']],
  ['black', ['pyproject.toml']],
  ['ktlint', ['.editorconfig']],
  [
    'ktfmt',
    [
      '.editorconfig',
      'build.gradle',
      'build.gradle.kts',
      'settings.gradle',
      'settings.gradle.kts',
      'gradle/libs.versions.toml',
    ],
  ],
  [
    'detekt',
    ['config/detekt/detekt', 'config/detekt', 'detekt'].flatMap((base) => [
      `${base}.yml`,
      `${base}.yaml`,
    ]),
  ],
]);

export function styleToolsOf(preset) {
  return STYLE_TOOLS.get(preset) ?? [];
}

export function styleToolNames() {
  return [...STYLE_TOOLS.values()].flat();
}

export function projectStyleFilesOf(tool) {
  return PROJECT_STYLE_FILES.get(tool) ?? [];
}

export const JAVA_TOOLS = [
  'pmd',
  'spotbugs',
  'errorprone',
  'archunit',
  'google-java-format',
  'jacoco',
  'checkstyle',
  'crap',
  'duplicates',
  'pit',
  'structure',
  'coupling',
  'spring',
];
