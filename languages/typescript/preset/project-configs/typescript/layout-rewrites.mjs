import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMAT,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../../../javascript/preset/javascript-preset.mjs';
import {
  SCRIPT_SKIPPED_FOLDERS,
  withSkippedFolders,
} from '../../../../../core/tooling/jscpd/skipped-folders.mjs';
import { TYPESCRIPT_ONLY_OPTIONS } from './typescript-project-options.mjs';
import { END_TO_END_ROOT, builtInExcludedGlobs, sourceRoots, testRoots } from '../../layout.mjs';
import {
  expandBraces,
  isProjectRoot,
  PROJECT_ROOT_EXCLUDED_GLOBS,
} from '../../layout/source-root/root-paths.mjs';

const DEFAULT_SOURCE_ROOTS = new Set(sourceRoots);
const DEFAULT_TEST_ROOTS = new Set(testRoots);

function executedRoots(layout) {
  return layout.executedTestRoots ?? layout.testRoots;
}

function rootedEntry(root, suffix) {
  if (!isProjectRoot(root)) {
    return `${root}${suffix}`;
  }
  return suffix === '' ? root : suffix.slice(1);
}

function projectRootExcludes(layout) {
  return layout.sourceRoots.some(isProjectRoot)
    ? [...new Set([...builtInExcludedGlobs, ...PROJECT_ROOT_EXCLUDED_GLOBS])]
    : [];
}

function expandLayoutRoots(entries, layout, testRootsOf = (value) => value.testRoots) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (DEFAULT_SOURCE_ROOTS.has(first)) {
      return layout.sourceRoots.map((root) => rootedEntry(root, suffix));
    }
    if (DEFAULT_TEST_ROOTS.has(first)) {
      return testRootsOf(layout).map((root) => `${root}${suffix}`);
    }
    return [entry];
  });
  return [...new Set(expanded)];
}

export function isCustomLayout(layout) {
  return (
    JSON.stringify([layout.sourceRoots, layout.testRoots, executedRoots(layout)]) !==
      JSON.stringify([
        sourceRoots,
        testRoots,
        testRoots.filter((root) => root !== END_TO_END_ROOT),
      ]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0 ||
    layout.duplicateSkippedFolders !== undefined
  );
}

function tsconfigRewrite(javascriptOptions, testRootsOf) {
  return function rewriteTsconfig(base, layout) {
    return {
      ...base,
      ...(layout.javascript
        ? { compilerOptions: { ...base.compilerOptions, ...javascriptOptions } }
        : {}),
      include: expandLayoutRoots(base.include, layout, testRootsOf),
      exclude: [
        ...new Set([
          ...base.exclude,
          ...projectRootExcludes(layout).flatMap(expandBraces),
          ...layout.exclude,
        ]),
      ],
    };
  };
}

const JAVASCRIPT_RELAXED_OPTIONS = Object.fromEntries(
  Object.keys(TYPESCRIPT_ONLY_OPTIONS).map((option) => [option, false]),
);

export const layoutTsconfig = tsconfigRewrite(
  { ...JAVASCRIPT_COMPILER_OPTIONS, ...JAVASCRIPT_RELAXED_OPTIONS, noEmit: true },
  (layout) => layout.testRoots,
);

export const layoutStrykerTsconfig = tsconfigRewrite(JAVASCRIPT_COMPILER_OPTIONS, executedRoots);

export function layoutKnipConfig(base, layout) {
  const javascript = layout.javascript === true;
  return {
    ...base,
    entry: [
      ...expandLayoutRoots(
        javascript ? [...base.entry, ...JAVASCRIPT_KNIP_ENTRIES] : base.entry,
        layout,
      ),
      ...(layout.entryPoints ?? []),
    ],
    project: expandLayoutRoots(
      javascript ? [...base.project, ...JAVASCRIPT_KNIP_PROJECT] : base.project,
      layout,
    ),
    ignore: [
      ...expandLayoutRoots(base.ignore, layout),
      ...projectRootExcludes(layout),
      ...layout.exclude,
    ],
  };
}

export function layoutJscpdConfig(base, layout) {
  return {
    ...base,
    ...(layout.javascript ? { format: [...base.format, JAVASCRIPT_JSCPD_FORMAT] } : {}),
    path: expandLayoutRoots(base.path, layout),
    ignore: [
      ...withSkippedFolders(base.ignore, SCRIPT_SKIPPED_FOLDERS, layout.duplicateSkippedFolders),
      ...projectRootExcludes(layout),
      ...layout.exclude,
    ],
  };
}

export function jsonTransform(rewrite, layout) {
  if (!isCustomLayout(layout) && layout.javascript !== true) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(JSON.parse(text), layout), null, 2)}\n`;
}
