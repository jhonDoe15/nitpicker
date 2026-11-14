import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHIPPED_FOLDERS = ['core', 'shared', 'languages'];
const SHIPPED_FOLDER = /^(?:core|shared|languages)\//u;
const UNSHIPPED_PATH =
  /(?:^|\/)(?:node_modules|fixtures|test-support|__tests__)\/|\.test\.m[jt]s$/u;
const UNSHIPPED_FOLDER = /^(?:node_modules|fixtures|test-support|__tests__)$/u;
const SOURCE = /\.mts$/u;

export function isShippedPath(relative) {
  return SHIPPED_FOLDER.test(relative) && !UNSHIPPED_PATH.test(relative);
}

function folderIn(root, folder) {
  const base = path.resolve(root);
  const full = path.resolve(base, folder);
  if (!full.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${folder} is outside ${base}`);
  }
  return full;
}

function entryPath(directory, entry) {
  return path.join(directory, entry.name);
}

function filesIn(folder) {
  const files = [];
  const pending = [folder];
  for (const directory of pending) {
    const entries = readdirSync(directory, { withFileTypes: true });
    files.push(
      ...entries.filter((entry) => entry.isFile()).map((entry) => entryPath(directory, entry)),
    );
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory() && !UNSHIPPED_FOLDER.test(entry.name))
        .map((entry) => entryPath(directory, entry)),
    );
  }
  return files;
}

export function shippedSources(root = PACKAGE_ROOT) {
  return SHIPPED_FOLDERS.map((folder) => folderIn(root, folder))
    .filter((folder) => existsSync(folder))
    .flatMap((folder) => filesIn(folder))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter((relative) => SOURCE.test(relative) && isShippedPath(relative))
    .sort()
    .map((relative) => path.join(root, relative));
}

export function emittedFile(source) {
  return source.replace(SOURCE, '.mjs');
}

export function transpiled(text, fileName, typescript) {
  return typescript.transpileModule(text, {
    fileName,
    reportDiagnostics: false,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2024,
      module: typescript.ModuleKind.NodeNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeNext,
      rewriteRelativeImportExtensions: true,
      verbatimModuleSyntax: true,
      removeComments: true,
    },
  }).outputText;
}

export function emit(root = PACKAGE_ROOT) {
  const typescript = createRequire(import.meta.url)('typescript-js-api');
  for (const source of shippedSources(root)) {
    writeFileSync(
      emittedFile(source),
      transpiled(readFileSync(source, 'utf8'), source, typescript),
    );
  }
}

export function clean(root = PACKAGE_ROOT) {
  for (const source of shippedSources(root)) {
    rmSync(emittedFile(source), { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.includes('--clean')) {
    clean();
  } else {
    emit();
  }
}
