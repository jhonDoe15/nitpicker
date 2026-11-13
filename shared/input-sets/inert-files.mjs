const TEXT_EXTENSIONS = new Set(['md', 'markdown']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp']);
const INERT_NAME =
  /^(?:README|LICENSE|LICENCE|NOTICE|AUTHORS|CONTRIBUTORS|CODEOWNERS|CHANGELOG|CHANGES|HISTORY)(?:\.(?:txt|rst))?$/iu;
const CODE_FOLDERS = new Set([
  'src',
  'source',
  'lib',
  'main',
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
  'fixtures',
  '__fixtures__',
  'testdata',
  'testing',
  'resources',
  'e2e',
  '__snapshots__',
  '__mocks__',
  'assets',
  'public',
  'static',
  'examples',
  'samples',
  'data',
  'templates',
]);

export function extensionOf(file) {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function isUnderRoot(file, root) {
  return root === '.' || root === '' || file.startsWith(`${root}/`) || file.includes(`/${root}/`);
}

export function isInertPath(file, { roots = [], images = true } = {}) {
  const parts = file.split('/');
  const name = parts.at(-1) ?? '';
  if (
    parts.slice(0, -1).some((folder) => CODE_FOLDERS.has(folder)) ||
    roots.some((root) => isUnderRoot(file, root))
  ) {
    return false;
  }
  const extension = extensionOf(file);
  return (
    TEXT_EXTENSIONS.has(extension) ||
    (images && IMAGE_EXTENSIONS.has(extension)) ||
    INERT_NAME.test(name)
  );
}
