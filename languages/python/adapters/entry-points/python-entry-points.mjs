import path from 'node:path';

const PACKAGE_FILE = '__init__.py';
const FOUNDATION_FOLDERS = new Set(['shared', 'utils']);
const COMPOSITION_ROOT_FILES = new Set(['main.py', 'server.py', 'composition_root.py']);

function packageFolders(files) {
  return new Set(
    files.filter((file) => path.posix.basename(file) === PACKAGE_FILE).map(path.posix.dirname),
  );
}

function rootPackages(folders) {
  return [...folders].filter((folder) => !folders.has(path.posix.dirname(folder)));
}

function componentFolders(folders) {
  const roots = rootPackages(folders);
  const components =
    roots.length === 1
      ? [...folders].filter((folder) => path.posix.dirname(folder) === roots[0])
      : roots;
  return new Set(
    components.filter((folder) => !FOUNDATION_FOLDERS.has(path.posix.basename(folder))),
  );
}

function dottedName(folder, folders) {
  const segments = folder.split('/');
  const outside = segments.findLastIndex(
    (_, index) => !folders.has(segments.slice(0, index + 1).join('/')),
  );
  return segments.slice(outside + 1).join('.');
}

function entryFields(file, { scanned, folders, components }) {
  const folder = path.posix.dirname(file);
  const declared = scanned[file]?.exports?.all;
  if (
    path.posix.basename(file) !== PACKAGE_FILE ||
    !components.has(folder) ||
    !Array.isArray(declared)
  ) {
    return {};
  }
  return { publicNames: declared, entryName: dottedName(folder, folders) };
}

function isCompositionRoot(file, { folders }) {
  const folder = path.posix.dirname(file);
  return (
    COMPOSITION_ROOT_FILES.has(path.posix.basename(file)) &&
    folders.has(folder) &&
    !folders.has(path.posix.dirname(folder))
  );
}

export function withEntryPoints(bundle, scanned) {
  const folders = packageFolders(bundle.modules.map(({ file }) => file));
  const context = { scanned, folders, components: componentFolders(folders) };
  return {
    ...bundle,
    modules: bundle.modules.map((module) => ({
      ...module,
      ...entryFields(module.file, context),
      ...(isCompositionRoot(module.file, context) ? { compositionRoot: true } : {}),
    })),
  };
}
