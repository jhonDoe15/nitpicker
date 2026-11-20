function fileNamed(names: readonly string[], extra?: string): RegExp {
  const named = `^(?:${names.join('|')})$`;
  return new RegExp(extra === undefined ? named : `${named}|${extra}`, 'u');
}

const JAVASCRIPT = fileNamed(
  [
    'package\\.json',
    'package-lock\\.json',
    'npm-shrinkwrap\\.json',
    'yarn\\.lock',
    'pnpm-lock\\.yaml',
    'pnpm-workspace\\.yaml',
    'nx\\.json',
    'angular\\.json',
    'bun\\.lockb?',
    '\\.npmrc',
    '\\.yarnrc(?:\\.yml)?',
  ],
  '(?:^|/)tsconfig[^/]*\\.json$',
);
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

const BY_PRESET = new Map<string, RegExp>([
  ['typescript', JAVASCRIPT],
  ['javascript', JAVASCRIPT],
  ['python', PYTHON],
  ['java', JVM],
  ['kotlin', JVM],
]);

function fromRoot(file: string, prefix: string): string | undefined {
  if (prefix === '.') {
    return file;
  }
  return file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : undefined;
}

export function isToolchainFileFor(
  preset: string | undefined,
  file: string,
  prefix = '.',
): boolean {
  const relative = fromRoot(file, prefix);
  return (
    relative !== undefined && (BY_PRESET.get(preset ?? 'typescript') ?? JAVASCRIPT).test(relative)
  );
}
