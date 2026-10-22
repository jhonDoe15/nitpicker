import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../shared/filesystem.mjs';
import { globMatcher } from '../../shared/paths/glob.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { readBuildSources } from '../../languages/java/builds/narrowing/build-sources.mjs';
import { jvmProductionReach } from '../../languages/java/builds/reach/source-reach.mjs';
import { pythonProductionReach } from '../../languages/python/adapters/analysis/reach/python-reach.mjs';
import { readPythonSelection } from '../../languages/python/adapters/configuration/pytest/test-selection.mjs';
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
import { readToolConfigs } from './build-files/tool-config-files.mjs';
import { isGeneratedJvm } from '../../languages/java/adapters/generated/generated-sources.mjs';
import { isGeneratedPython } from '../../languages/python/libraries/generated-files.mjs';
import { isMarkedGenerated } from '../../languages/typescript/preset/layout/generated-files.mjs';

const GRADLE_EXTENSIONS = ['java', 'kt', 'kts'];
const PRESET_EXTENSIONS = new Map([
  ['python', ['py']],
  ['go', ['go']],
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
  const patterns = globs.map(globMatcher);
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
  buildSources,
  toolConfigs = [],
  reach = () => new Map(),
  blobOf = () => 'unread',
  generated = { base: () => false, head: () => false },
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
    buildSources,
    toolConfigs,
    productionReach: computedOnce(reach),
    blobOf,
    generated,
  };
}

export function listedFiles(projectRoot) {
  return existsSync(projectRoot)
    ? runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
        .split('\0')
        .filter(Boolean)
    : [];
}

function typescriptReach(headProjectRoot, headConfig, files) {
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

function mainSourceRoots(sources) {
  return sources
    .filter(({ type, set }) => type === 'roots' && set === 'main')
    .flatMap(({ roots }) => roots);
}

function productionReachOf({ headProjectRoot, headConfig, files, headRoots, headSources }) {
  const isHidden = matcherOf(headConfig.exclude ?? []);
  if (headConfig.preset === 'python') {
    return pythonProductionReach(headProjectRoot, {
      sourceRoots: headRoots['python.sourceRoots'],
      isHidden,
    });
  }
  if (GRADLE_PRESETS.includes(headConfig.preset)) {
    const roots = mainSourceRoots(headSources);
    return jvmProductionReach(headProjectRoot, {
      files: codeOf(files, headConfig),
      isImporter: (file) => roots.some((root) => isUnder(file, root)) && !isHidden(file),
    });
  }
  return usesLayout(headConfig) ? typescriptReach(headProjectRoot, headConfig, files) : new Map();
}

function buildSourcesOf({ preset }, { projectRoot, files, roots }) {
  if (preset === 'python') {
    return readPythonSelection(
      projectRoot,
      roots['python.sourceRoots'] ?? detectSourceRoots(projectRoot, undefined),
    );
  }
  return GRADLE_PRESETS.includes(preset) ? readBuildSources(projectRoot, files) : [];
}

function generatedTestOf(preset) {
  if (preset === 'python') {
    return isGeneratedPython;
  }
  return GRADLE_PRESETS.includes(preset) ? isGeneratedJvm : isMarkedGenerated;
}

function generatedReaders(preset, baseProjectRoot, headProjectRoot) {
  const isGenerated = generatedTestOf(preset);
  return {
    base: (file) => isGenerated(baseProjectRoot, file),
    head: (file) => isGenerated(headProjectRoot, file),
  };
}

function blobReader(projectRoot) {
  return (file) => {
    const absolute = pathInside(projectRoot, file);
    return absolute !== undefined && existsSync(absolute)
      ? gitBlobId(readFileSync(absolute))
      : 'absent';
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
  const baseRoots = rootSets(baseConfig, baseProjectRoot);
  const headRoots = rootSets(headConfig, headProjectRoot);
  const base = { projectRoot: baseProjectRoot, files: baseFiles, roots: baseRoots };
  const head = { projectRoot: headProjectRoot, files, roots: headRoots };
  const headSources = buildSourcesOf(headConfig, head);
  return createPolicyScope({
    files,
    baseFiles,
    baseRoots,
    headRoots,
    headConfig,
    moves,
    presetRequired: presetToDeclare(headConfig, headProjectRoot) !== undefined,
    tsconfigs: isTypescriptPreset(headConfig)
      ? {
          base: tsconfigsOf(baseProjectRoot, baseFiles, baseConfig),
          head: tsconfigsOf(headProjectRoot, files, headConfig),
        }
      : undefined,
    buildSources: { base: buildSourcesOf(headConfig, base), head: headSources },
    toolConfigs: readToolConfigs(
      { config: baseConfig, root: baseProjectRoot, files: baseFiles },
      { config: headConfig, root: headProjectRoot, files },
      gitBlobId,
    ),
    reach: () => productionReachOf({ headProjectRoot, headConfig, files, headRoots, headSources }),
    blobOf: blobReader(headProjectRoot),
    generated: generatedReaders(headConfig.preset, baseProjectRoot, headProjectRoot),
  });
}
