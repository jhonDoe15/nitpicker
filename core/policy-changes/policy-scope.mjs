import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../../shared/glob.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { detectSourceRoots } from '../../languages/python/adapters/execution/python-project.mjs';
import { resolveLayout, resolveLayoutFor } from '../../languages/typescript/preset/layout.mjs';
import {
  packageEntryFiles,
  productionReach,
} from '../../languages/typescript/preset/modules/production-imports.mjs';
import {
  checksJavascript,
  projectTsconfigs,
} from '../../languages/typescript/preset/modules/tsconfig-files.mjs';
import { presetToDeclare } from '../configuration/project-checks/preset-detection.mjs';

const GRADLE_EXTENSIONS = ['java', 'kt', 'kts'];
const PRESET_EXTENSIONS = new Map([
  ['python', ['py']],
  ['java', GRADLE_EXTENSIONS],
  ['kotlin', GRADLE_EXTENSIONS],
]);

export function gitBlobId(content) {
  return createHash('sha1')
    .update(`blob ${String(content.length)}\0`)
    .update(content)
    .digest('hex');
}

export function matcherOf(globs = []) {
  const patterns = globs.map(globToRegExp);
  return (file) => patterns.some((pattern) => pattern.test(file));
}

export function isUnder(file, root) {
  return root === '.' || root === '' || file === root || file.startsWith(`${root}/`);
}

function usesLayout(config) {
  return !PRESET_EXTENSIONS.has(config.preset);
}

function layoutOf(config) {
  return resolveLayout(config.layout, [], { javascript: config.preset === 'javascript' });
}

export function rootSets(config, projectRoot) {
  if (config.preset === 'python') {
    return { 'python.sourceRoots': detectSourceRoots(projectRoot, config.python?.sourceRoots) };
  }
  if (!usesLayout(config)) {
    return {};
  }
  const layout = layoutOf(config);
  return { 'layout.sourceRoots': layout.sourceRoots, 'layout.testRoots': layout.testRoots };
}

function extensionsOf(config) {
  return PRESET_EXTENSIONS.get(config.preset) ?? layoutOf(config).extensions;
}

function foldersOf(file) {
  const parts = file.split('/');
  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

function basePathResolver({ files = new Map(), directories = new Map() } = {}, folders) {
  const fileSources = new Map([...files].map(([from, to]) => [to, from]));
  const folderSources = [...directories].map(([from, to]) => [to, from]);
  return (headPath) => {
    const renamed = fileSources.get(headPath);
    if (renamed !== undefined || !folders.has(headPath)) {
      return renamed ?? headPath;
    }
    const moved = folderSources.find(([to]) => isUnder(headPath, to));
    return moved === undefined ? headPath : `${moved[1]}${headPath.slice(moved[0].length)}`;
  };
}

function computedOnce(compute) {
  const results = [];
  return () => {
    if (results.length === 0) {
      results.push(compute());
    }
    return results[0];
  };
}

function codeOf(files, config) {
  const extensions = new Set(extensionsOf(config));
  return files.filter((file) => extensions.has(file.slice(file.lastIndexOf('.') + 1)));
}

function isTypescriptPreset(config) {
  return usesLayout(config) && config.preset !== 'javascript';
}

function tsconfigsOf(projectRoot, files, config) {
  const hidden = resolveLayoutFor(config);
  return new Map(
    projectTsconfigs(projectRoot, files, hidden.isExcluded).map((file) => [
      file,
      checksJavascript(path.join(projectRoot, file)),
    ]),
  );
}

export function createPolicyScope({
  files,
  baseFiles = files,
  baseRoots,
  headRoots,
  headConfig,
  moves,
  presetRequired = false,
  tsconfigs,
  reach = () => new Map(),
  blobOf = () => 'unread',
}) {
  const code = codeOf(files, headConfig);
  const baseFileSet = new Set(baseFiles);
  const folders = new Set(code.flatMap(foldersOf));
  const basePathOf = basePathResolver(moves, folders);
  const keptCode = code.filter((file) => basePathOf(file) === file && baseFileSet.has(file));
  return {
    code,
    keptCode,
    keptPaths: [...keptCode, ...new Set(keptCode.flatMap(foldersOf))],
    codePaths: [...code, ...folders],
    baseCode: codeOf(baseFiles, headConfig),
    usesLayout: usesLayout(headConfig),
    baseRoots,
    headRoots,
    basePathOf,
    existsInBase: (file) => baseFileSet.has(file),
    presetRequired,
    tsconfigs,
    productionReach: computedOnce(reach),
    blobOf,
  };
}

function listedFiles(projectRoot) {
  return existsSync(projectRoot)
    ? runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(Boolean)
    : [];
}

function productionReachOf(headProjectRoot, headConfig, files) {
  if (!usesLayout(headConfig)) {
    return new Map();
  }
  const layout = resolveLayoutFor(headConfig);
  const isEntryPoint = matcherOf(headConfig.layout?.entryPoints ?? []);
  const code = codeOf(files, headConfig);
  return productionReach(headProjectRoot, {
    importers: code.filter((file) => layout.isSourceFile(file)),
    entries: [
      ...packageEntryFiles(headProjectRoot, files),
      ...code.filter(isEntryPoint).map((file) => ({ file, label: 'layout.entryPoints' })),
    ],
  });
}

function blobReader(projectRoot) {
  return (file) => {
    const absolute = path.join(projectRoot, file);
    return existsSync(absolute) ? gitBlobId(readFileSync(absolute)) : 'absent';
  };
}

export function readPolicyScope({
  baseConfig,
  headConfig,
  baseProjectRoot,
  headProjectRoot,
  moves,
}) {
  const files = listedFiles(headProjectRoot);
  const baseFiles = listedFiles(baseProjectRoot);
  return createPolicyScope({
    files,
    baseFiles,
    baseRoots: rootSets(baseConfig, baseProjectRoot),
    headRoots: rootSets(headConfig, headProjectRoot),
    headConfig,
    moves,
    presetRequired: presetToDeclare(headConfig, headProjectRoot) !== undefined,
    tsconfigs: isTypescriptPreset(headConfig)
      ? {
          base: tsconfigsOf(baseProjectRoot, baseFiles, baseConfig),
          head: tsconfigsOf(headProjectRoot, files, headConfig),
        }
      : undefined,
    reach: () => productionReachOf(headProjectRoot, headConfig, files),
    blobOf: blobReader(headProjectRoot),
  });
}
