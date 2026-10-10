import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_SOURCE_ROOT = 'src';
const DEFAULT_TEST_ROOTS = new Set(['test', 'tests']);

export function expandLayoutRoots(entries, layout) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (first === DEFAULT_SOURCE_ROOT) {
      return layout.sourceRoots.map((root) => `${root}${suffix}`);
    }
    if (DEFAULT_TEST_ROOTS.has(first)) {
      return layout.testRoots.map((root) => `${root}${suffix}`);
    }
    return [entry];
  });
  return [...new Set(expanded)];
}

export function isCustomLayout(layout) {
  return (
    JSON.stringify([layout.sourceRoots, layout.testRoots]) !==
      JSON.stringify([[DEFAULT_SOURCE_ROOT], [...DEFAULT_TEST_ROOTS]]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0
  );
}

export function layoutTsconfig(base, layout) {
  return {
    ...base,
    include: expandLayoutRoots(base.include, layout),
    exclude: [...base.exclude, ...layout.exclude],
  };
}

export function layoutKnipConfig(base, layout) {
  return {
    ...base,
    entry: [...expandLayoutRoots(base.entry, layout), ...(layout.entryPoints ?? [])],
    project: expandLayoutRoots(base.project, layout),
    ignore: [...expandLayoutRoots(base.ignore, layout), ...layout.exclude],
  };
}

export function layoutJscpdConfig(base, layout) {
  return {
    ...base,
    path: expandLayoutRoots(base.path, layout),
    ignore: [...base.ignore, ...layout.exclude],
  };
}

export function jsonTransform(rewrite, layout) {
  if (!isCustomLayout(layout)) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(JSON.parse(text), layout), null, 2)}\n`;
}

const REWRITES = new Map([
  ['tsconfig.quality.json', layoutTsconfig],
  ['tsconfig.stryker.json', layoutTsconfig],
  ['knip.json', layoutKnipConfig],
  ['jscpd.json', layoutJscpdConfig],
]);

const TSCONFIG_POLICY_FILES = new Set(['tsconfig.quality.json', 'tsconfig.stryker.json']);

export function layoutTransformFor(policyFileName, layout) {
  const name = policyFileName.split('/').at(-1);
  const rewrite = REWRITES.get(name);
  const layoutTransform = rewrite === undefined ? undefined : jsonTransform(rewrite, layout);
  if (!TSCONFIG_POLICY_FILES.has(name)) {
    return layoutTransform;
  }
  return (text, targetPath) =>
    existsSync(path.join(path.dirname(targetPath), PROJECT_TSCONFIG))
      ? `${JSON.stringify(projectLayeredTsconfig(JSON.parse(text), layout, name), null, 2)}\n`
      : (layoutTransform?.(text) ?? text);
}

const PROJECT_TSCONFIG = 'tsconfig.json';

const POLICY_COMPILER_OPTIONS = {
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  noImplicitThis: true,
  useUnknownInCatchVariables: true,
  alwaysStrict: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  forceConsistentCasingInFileNames: true,
};

const NO_EMIT_ANALYSIS_OPTIONS = { noEmit: true, skipLibCheck: true };

function projectLayeredTsconfig(base, layout, policyFileName) {
  if (policyFileName === 'tsconfig.stryker.json') {
    return { extends: `./${PROJECT_TSCONFIG}`, compilerOptions: { skipLibCheck: true } };
  }
  const layered = layoutTsconfig(base, layout);
  return {
    extends: `./${PROJECT_TSCONFIG}`,
    compilerOptions: { ...NO_EMIT_ANALYSIS_OPTIONS, ...POLICY_COMPILER_OPTIONS },
    include: layered.include,
    exclude: layered.exclude,
  };
}
