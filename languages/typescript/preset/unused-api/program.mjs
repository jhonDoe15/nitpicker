import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { filesUnder } from '../../../../shared/filesystem.mjs';
import { codeExtensionNames } from '../layout.mjs';
import { workspacePaths } from './workspace/entries.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mjs';

const NO_INPUTS = 18_003;
const SCRIPT_DIRECTORIES = ['scripts'];
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');
const ROOT_CONFIG_FILE = new RegExp(`\\.config\\.(?:${codeExtensionNames.join('|')})$`, 'u');

function configError(diagnostics) {
  const messages = diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  return troubleshootingError(
    `The TypeScript config could not be read: ${messages.join('; ')}`,
    TROUBLESHOOTING_ANCHORS.typescriptConfigUnreadable,
  );
}

function parseConfig(configPath, projectRoot) {
  const configFile = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  if (configFile.error !== undefined) throw configError([configFile.error]);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
    { allowJs: true },
    configPath,
  );
  const errors = parsed.errors.filter(({ code }) => code !== NO_INPUTS);
  if (errors.length > 0) throw configError(errors);
  return parsed;
}

function isCodeFile(file) {
  return CODE_FILE.test(file) && !file.endsWith('.d.ts');
}

function rootConfigsAndScripts(projectRoot, layout) {
  const configs = readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ROOT_CONFIG_FILE.test(entry.name))
    .map((entry) => path.join(projectRoot, entry.name));
  const scripts = SCRIPT_DIRECTORIES.map((name) => path.join(projectRoot, name))
    .filter((directory) => existsSync(directory))
    .flatMap((directory) => [...filesUnder(directory)]);
  return [...configs, ...scripts].filter(
    (file) => isCodeFile(file) && !layout.isExcluded(path.relative(projectRoot, file)),
  );
}

function isSkippedDirectory(absolute, entry, { layout, projectRoot }) {
  const relative = path.relative(projectRoot, absolute).split(path.sep).join('/');
  return (
    entry.name.startsWith('.') ||
    layout.excludedGlobs.some((glob) => path.posix.matchesGlob(`${relative}/x`, glob))
  );
}

export function codeFilesUnder(directories, layout, projectRoot) {
  const walked = { layout, projectRoot };
  return directories
    .flatMap((dir) => [
      ...filesUnder(dir, {
        skipDirectory: (absolute, entry) => isSkippedDirectory(absolute, entry, walked),
      }),
    ])
    .filter((file) => isCodeFile(file));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function walkRules({ projectRoot, layout }) {
  const root = path.resolve(projectRoot);
  const walked = { layout, projectRoot: root };
  const plain = new Map();
  function isPlainDirectory(directory) {
    if (!plain.has(directory)) {
      const entry = lstatSync(directory, { throwIfNoEntry: false });
      const skipped = isSkippedDirectory(directory, { name: path.basename(directory) }, walked);
      plain.set(directory, entry?.isDirectory() === true && !skipped);
    }
    return plain.get(directory);
  }
  function isWalkedDirectory(directory) {
    const segments = path.relative(root, directory).split(path.sep).filter(Boolean);
    return (
      isInside(root, directory) &&
      segments
        .map((_, index) => path.join(root, ...segments.slice(0, index + 1)))
        .every((ancestor) => isPlainDirectory(ancestor))
    );
  }
  return {
    isDirectory: (directory) => isWalkedDirectory(path.resolve(directory)),
    isFile: (file) =>
      isCodeFile(file) &&
      lstatSync(file, { throwIfNoEntry: false })?.isFile() === true &&
      isWalkedDirectory(path.dirname(path.resolve(file))),
  };
}

function compilerOptions({ parsed, packages, projectRoot, layout }) {
  return {
    ...parsed.options,
    noEmit: true,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    types: [],
    jsx: parsed.options.jsx ?? ts.JsxEmit.ReactJSX,
    paths: { ...workspacePaths(packages, layout), ...parsed.options.paths },
    pathsBasePath: parsed.options.pathsBasePath ?? projectRoot,
  };
}

/**
 * One program over the project's files (from the layered policy tsconfig, so `paths`, `extends` and
 * references resolve as the type check does), its root configs and scripts, and the code of the
 * other workspace packages. Ambient `types` are left out: imported modules still bring theirs.
 */
export function createProjectProgram({ projectRoot, configPath, packagesInfo, layout }) {
  const parsed = parseConfig(configPath, projectRoot);
  const siblings = packagesInfo.packages.filter(
    ({ dir }) => dir !== projectRoot && !projectRoot.startsWith(`${dir}${path.sep}`),
  );
  const rootNames = new Set([
    ...parsed.fileNames,
    ...rootConfigsAndScripts(projectRoot, layout),
    ...codeFilesUnder(
      siblings.map(({ dir }) => dir),
      layout,
      projectRoot,
    ),
  ]);
  return ts.createProgram({
    rootNames: [...rootNames],
    options: compilerOptions({ parsed, packages: packagesInfo.packages, projectRoot, layout }),
  });
}
