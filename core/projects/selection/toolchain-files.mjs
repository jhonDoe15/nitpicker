function fileNamed(names, extra) {
  const named = `(?:^|/)(?:${names.join('|')})$`;
  return new RegExp(extra === undefined ? named : `${named}|${extra}`, 'u');
}

const JAVASCRIPT = fileNamed([
  'package\\.json',
  'package-lock\\.json',
  'npm-shrinkwrap\\.json',
  'yarn\\.lock',
  'pnpm-lock\\.yaml',
  'pnpm-workspace\\.yaml',
  'bun\\.lockb?',
  'tsconfig[^/]*\\.json',
  '\\.npmrc',
  '\\.yarnrc(?:\\.yml)?',
]);
const PYTHON = fileNamed([
  'pyproject\\.toml',
  'uv\\.lock',
  'poetry\\.lock',
  'requirements[^/]*\\.txt',
  'setup\\.cfg',
  'ruff\\.toml',
  '\\.python-version',
]);
const JVM = fileNamed(
  [
    'settings\\.gradle(?:\\.kts)?',
    'build\\.gradle(?:\\.kts)?',
    'gradle\\.properties',
    'libs\\.versions\\.toml',
    'pom\\.xml',
  ],
  '^(?:gradle|buildSrc)/',
);

const BY_PRESET = new Map([
  ['typescript', JAVASCRIPT],
  ['javascript', JAVASCRIPT],
  ['python', PYTHON],
  ['java', JVM],
  ['kotlin', JVM],
]);

export function isToolchainFileFor(preset, file) {
  return (BY_PRESET.get(preset ?? 'typescript') ?? JAVASCRIPT).test(file);
}
