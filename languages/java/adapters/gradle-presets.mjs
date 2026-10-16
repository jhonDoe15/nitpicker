export const GRADLE_PRESETS = ['java', 'kotlin'];

export const PROJECT_TOOL_CONFIGS = new Map([
  ['pmd', 'config/pmd/ruleset.xml'],
  ['checkstyle', 'config/checkstyle/checkstyle.xml'],
]);

export const STYLE_TOOLS = new Map([
  ['python', ['ruff', 'black']],
  ['kotlin', ['ktlint', 'ktfmt', 'detekt']],
]);

export const PROJECT_STYLE_FILES = new Map([
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

export const STYLE_TOOL_NAMES = [...STYLE_TOOLS.values()].flat();

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
