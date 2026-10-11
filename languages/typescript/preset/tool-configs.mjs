import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMATS,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';

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

function tsconfigRewrite(javascriptOptions) {
  return function rewriteTsconfig(base, layout) {
    return {
      ...base,
      ...(layout.javascript
        ? { compilerOptions: { ...base.compilerOptions, ...javascriptOptions } }
        : {}),
      include: expandLayoutRoots(base.include, layout),
      exclude: [...base.exclude, ...layout.exclude],
    };
  };
}

export const layoutTsconfig = tsconfigRewrite({ ...JAVASCRIPT_COMPILER_OPTIONS, noEmit: true });

const layoutStrykerTsconfig = tsconfigRewrite(JAVASCRIPT_COMPILER_OPTIONS);

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
    ignore: [...expandLayoutRoots(base.ignore, layout), ...layout.exclude],
  };
}

export function layoutJscpdConfig(base, layout) {
  return {
    ...base,
    ...(layout.javascript ? { format: JAVASCRIPT_JSCPD_FORMATS } : {}),
    path: expandLayoutRoots(base.path, layout),
    ignore: [...base.ignore, ...layout.exclude],
  };
}

export function jsonTransform(rewrite, layout) {
  if (!isCustomLayout(layout) && layout.javascript !== true) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(JSON.parse(text), layout), null, 2)}\n`;
}

const REWRITES = new Map([
  ['tsconfig.quality.json', layoutTsconfig],
  ['tsconfig.stryker.json', layoutStrykerTsconfig],
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
  return (text, targetPath) => {
    const projectConfig = projectConfigName(path.dirname(targetPath), layout);
    return projectConfig === undefined
      ? (layoutTransform?.(text) ?? text)
      : `${JSON.stringify(projectLayeredTsconfig(JSON.parse(text), layout, { name, projectConfig }), null, 2)}\n`;
  };
}

const PROJECT_TSCONFIG = 'tsconfig.json';
const PROJECT_JSCONFIG = 'jsconfig.json';

function projectConfigName(directory, layout) {
  if (existsSync(path.join(directory, PROJECT_TSCONFIG))) {
    return PROJECT_TSCONFIG;
  }
  return layout.javascript && existsSync(path.join(directory, PROJECT_JSCONFIG))
    ? PROJECT_JSCONFIG
    : undefined;
}

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
  noUncheckedIndexedAccess: true,
  forceConsistentCasingInFileNames: true,
};

const NO_EMIT_ANALYSIS_OPTIONS = { noEmit: true, skipLibCheck: true };

function projectLayeredTsconfig(base, layout, { name, projectConfig }) {
  const javascriptOptions = layout.javascript ? JAVASCRIPT_COMPILER_OPTIONS : {};
  if (name === 'tsconfig.stryker.json') {
    return {
      extends: `./${projectConfig}`,
      compilerOptions: { skipLibCheck: true, ...javascriptOptions },
    };
  }
  const layered = layoutTsconfig(base, layout);
  return {
    extends: `./${projectConfig}`,
    compilerOptions: {
      ...NO_EMIT_ANALYSIS_OPTIONS,
      ...POLICY_COMPILER_OPTIONS,
      ...javascriptOptions,
    },
    include: layered.include,
    exclude: layered.exclude,
  };
}
