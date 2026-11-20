import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMAT,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../../../javascript/preset/javascript-preset.mts';
import {
  SCRIPT_SKIPPED_FOLDERS,
  withSkippedFolders,
} from '../../../../../core/tooling/jscpd/skipped-folders.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';
import { TYPESCRIPT_ONLY_OPTIONS } from './typescript-project-options.mts';
import { END_TO_END_ROOT, builtInExcludedGlobs, sourceRoots, testRoots } from '../../layout.mts';
import {
  expandBraces,
  isProjectRoot,
  PROJECT_ROOT_EXCLUDED_GLOBS,
} from '../../layout/source-root/root-paths.mts';
import type {
  ConfigRewrite,
  JscpdConfig,
  KnipConfig,
  RewrittenTsconfig,
  Tsconfig,
  ToolLayout,
} from '../../typed/tool-config/tool-config-types.mts';

const DEFAULT_SOURCE_ROOTS = new Set(sourceRoots);
const DEFAULT_TEST_ROOTS = new Set(testRoots);

function executedRoots(layout: ToolLayout): readonly string[] {
  return layout.executedTestRoots ?? layout.testRoots;
}

function rootedEntry(root: string, suffix: string): string {
  if (!isProjectRoot(root)) {
    return `${root}${suffix}`;
  }
  return suffix === '' ? root : suffix.slice(1);
}

function projectRootExcludes(layout: ToolLayout): string[] {
  return layout.sourceRoots.some(isProjectRoot)
    ? [...new Set([...builtInExcludedGlobs, ...PROJECT_ROOT_EXCLUDED_GLOBS])]
    : [];
}

function expandLayoutRoots(
  entries: readonly string[],
  layout: ToolLayout,
  testRootsOf: (value: ToolLayout) => readonly string[] = (value) => value.testRoots,
): string[] {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (DEFAULT_SOURCE_ROOTS.has(first ?? '')) {
      return layout.sourceRoots.map((root) => rootedEntry(root, suffix));
    }
    if (DEFAULT_TEST_ROOTS.has(first ?? '')) {
      return testRootsOf(layout).map((root) => `${root}${suffix}`);
    }
    return [entry];
  });
  return [...new Set(expanded)];
}

export function isCustomLayout(layout: ToolLayout): boolean {
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

function tsconfigRewrite(
  javascriptOptions: Readonly<Record<string, unknown>>,
  testRootsOf: (layout: ToolLayout) => readonly string[],
): (base: Tsconfig, layout: ToolLayout) => RewrittenTsconfig {
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

export function layoutKnipConfig(base: KnipConfig, layout: ToolLayout): KnipConfig {
  const javascript = layout.javascript;
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

export function layoutJscpdConfig(base: JscpdConfig, layout: ToolLayout): JscpdConfig {
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

export function jsonTransform(
  rewrite: ConfigRewrite,
  layout: ToolLayout,
): ((text: string) => string) | undefined {
  if (!(isCustomLayout(layout) || layout.javascript)) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(parseJson(text), layout), null, 2)}\n`;
}
