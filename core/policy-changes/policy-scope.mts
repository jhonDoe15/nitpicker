import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  packageEntryFiles,
  productionReach,
  pythonProductionReach,
  resolveLayoutFor,
  detectSourceRoots,
  GRADLE_PRESETS,
  isGeneratedGo,
  isGeneratedJvm,
  isGeneratedPython,
  isMarkedGenerated,
  jvmProductionReach,
  pathInside,
  presetToDeclare,
  projectFilePaths,
  readBuildSources,
  readPythonSelection,
} from './types/typed-views.mts';
import type {
  BuildSource,
  PolicyConfig,
  PolicyRead,
  PolicyScope,
  RootSets,
  ScopeInputs,
  Side,
} from './types/policy-types.mts';
import {
  codeOf,
  foldersOf,
  isUnder,
  layoutOf,
  matcherOf,
  PYTHON,
  usesLayout,
} from './scope/scope-files.mts';
import { typescriptScope } from './scope/typescript-scope.mts';
import { readToolConfigs } from './build-files/tool-config-files.mts';
import { importedAmong } from './imported-files.mts';

export function gitBlobId(content: string | Uint8Array): string {
  return createHash('sha1')
    .update(`blob ${String(content.length)}\0`)
    .update(content)
    .digest('hex');
}

export function rootSets(config: PolicyConfig, projectRoot: string): RootSets {
  if (config.preset === PYTHON) {
    return { 'python.sourceRoots': detectSourceRoots(projectRoot, config.python?.sourceRoots) };
  }
  if (!usesLayout(config)) {
    return {};
  }
  const layout = layoutOf(config);
  return { 'layout.sourceRoots': layout.sourceRoots, 'layout.testRoots': layout.testRoots };
}

function basePathResolver(
  {
    files = new Map<string, string>(),
    directories = new Map<string, string>(),
  }: ScopeInputs['moves'] = {},
  folders: ReadonlySet<string>,
): (headPath: string) => string {
  const fileSources = new Map([...files].map(([from, to]): [string, string] => [to, from]));
  const folderSources = [...directories].map(([from, to]): [string, string] => [to, from]);
  return (headPath) => {
    const renamed = fileSources.get(headPath);
    if (renamed !== undefined || !folders.has(headPath)) {
      return renamed ?? headPath;
    }
    const moved = folderSources.find(([to]) => isUnder(headPath, to));
    return moved === undefined ? headPath : `${moved[1]}${headPath.slice(moved[0].length)}`;
  };
}

function computedOnce<Result>(compute: () => Result): () => Result {
  let computed: { readonly value: Result } | undefined;
  return () => {
    computed ??= { value: compute() };
    return computed.value;
  };
}

export function createPolicyScope({
  files,
  baseFiles = files,
  baseRoots,
  headRoots,
  headConfig,
  moves,
  presetRequired,
  tsconfigs,
  checkedJavascript,
  buildSources,
  toolConfigs = [],
  reach = () => new Map(),
  importedBy = () => [],
  blobOf = () => 'unread',
  generated = { base: () => false, head: () => false },
}: ScopeInputs): PolicyScope {
  const code = codeOf(files, headConfig);
  const baseFileSet = new Set(baseFiles);
  const folders = new Set(code.flatMap(foldersOf));
  const basePathOf = basePathResolver(moves, folders);
  const keptCode = code.filter((file) => basePathOf(file) === file && baseFileSet.has(file));
  return {
    code,
    keptCode,
    keptPaths: [...keptCode, ...new Set(keptCode.flatMap(foldersOf))],
    baseCode: codeOf(baseFiles, headConfig),
    usesLayout: usesLayout(headConfig),
    baseRoots,
    headRoots,
    basePathOf,
    existsInBase: (file) => baseFileSet.has(file),
    presetRequired: presetRequired === true,
    tsconfigs,
    checkedJavascript,
    buildSources,
    toolConfigs,
    productionReach: computedOnce(reach),
    importedBy,
    blobOf,
    generated,
  };
}

export { isUnder, matcherOf, projectFilePaths as listedFiles };

function typescriptReach(
  headProjectRoot: string,
  headConfig: PolicyConfig,
  files: readonly string[],
): ReadonlyMap<string, string> {
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

function mainSourceRoots(sources: readonly BuildSource[]): string[] {
  return sources.flatMap((source) =>
    source.type === 'roots' && source.set === 'main' ? (source.roots ?? []) : [],
  );
}

function productionReachOf({
  headProjectRoot,
  headConfig,
  files,
  headRoots,
  headSources,
}: {
  headProjectRoot: string;
  headConfig: PolicyConfig;
  files: readonly string[];
  headRoots: RootSets;
  headSources: readonly BuildSource[];
}): ReadonlyMap<string, string> {
  const isHidden = matcherOf(headConfig.exclude ?? []);
  if (headConfig.preset === PYTHON) {
    return pythonProductionReach(headProjectRoot, {
      sourceRoots: headRoots['python.sourceRoots'] ?? [],
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

function buildSourcesOf(
  { preset }: PolicyConfig,
  { projectRoot, files, roots }: Side,
): BuildSource[] {
  if (preset === PYTHON) {
    return readPythonSelection(
      projectRoot,
      roots['python.sourceRoots'] ?? detectSourceRoots(projectRoot, undefined),
    );
  }
  return GRADLE_PRESETS.includes(preset) ? readBuildSources(projectRoot, files) : [];
}

function generatedTestOf(
  preset: string | undefined,
): (projectRoot: string, file: string) => boolean {
  if (preset === PYTHON) {
    return isGeneratedPython;
  }
  if (preset === 'go') {
    return isGeneratedGo;
  }
  return GRADLE_PRESETS.includes(preset) ? isGeneratedJvm : isMarkedGenerated;
}

function generatedReaders(
  preset: string | undefined,
  baseProjectRoot: string,
  headProjectRoot: string,
): PolicyScope['generated'] {
  const isGenerated = generatedTestOf(preset);
  return {
    base: (file) => isGenerated(baseProjectRoot, file),
    head: (file) => isGenerated(headProjectRoot, file),
  };
}

function blobReader(projectRoot: string): (file: string) => string {
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
  liveProjectRoot = headProjectRoot,
  moves,
  replacedOptions,
}: PolicyRead): PolicyScope {
  const files = projectFilePaths(headProjectRoot);
  const baseFiles = projectFilePaths(baseProjectRoot);
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
    presetRequired: presetToDeclare(headConfig, headProjectRoot) === undefined ? undefined : true,
    ...typescriptScope(
      { root: baseProjectRoot, files: baseFiles, config: baseConfig },
      { root: headProjectRoot, files, config: headConfig },
    ),
    buildSources: { base: buildSourcesOf(headConfig, base), head: headSources },
    toolConfigs: readToolConfigs(
      { config: baseConfig, root: baseProjectRoot, files: baseFiles, liveRoot: liveProjectRoot },
      { config: headConfig, root: headProjectRoot, files, liveRoot: liveProjectRoot },
      { gitBlobId, replacedOptions },
    ),
    reach: () => productionReachOf({ headProjectRoot, headConfig, files, headRoots, headSources }),
    importedBy: (candidates) =>
      importedAmong(
        { projectRoot: headProjectRoot, config: headConfig, files, roots: headRoots },
        candidates,
      ),
    blobOf: blobReader(headProjectRoot),
    generated: generatedReaders(headConfig.preset, baseProjectRoot, headProjectRoot),
  });
}
