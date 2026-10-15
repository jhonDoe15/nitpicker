import { globToRegExp } from '../../shared/glob.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { detectSourceRoots } from '../../languages/python/adapters/execution/python-project.mjs';
import { resolveLayout } from '../../languages/typescript/preset/layout.mjs';

const GRADLE_EXTENSIONS = ['java', 'kt', 'kts'];
const PRESET_EXTENSIONS = new Map([
  ['python', ['py']],
  ['java', GRADLE_EXTENSIONS],
  ['kotlin', GRADLE_EXTENSIONS],
]);

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

export function createPolicyScope({ files, baseRoots, headRoots, headConfig, moves }) {
  const extensions = new Set(extensionsOf(headConfig));
  const code = files.filter((file) => extensions.has(file.slice(file.lastIndexOf('.') + 1)));
  const roots = Object.values(headRoots).flat();
  const checked = usesLayout(headConfig)
    ? code.filter((file) => roots.some((root) => isUnder(file, root)))
    : code;
  const folders = new Set(checked.flatMap(foldersOf));
  return {
    code,
    checked,
    paths: [...checked, ...folders],
    baseRoots,
    headRoots,
    basePathOf: basePathResolver(moves, folders),
  };
}

export function readPolicyScope({
  baseConfig,
  headConfig,
  baseProjectRoot,
  headProjectRoot,
  moves,
}) {
  const files = runGit(headProjectRoot, ['ls-files', '-z']).split('\0').filter(Boolean);
  return createPolicyScope({
    files,
    baseRoots: rootSets(baseConfig, baseProjectRoot),
    headRoots: rootSets(headConfig, headProjectRoot),
    headConfig,
    moves,
  });
}
