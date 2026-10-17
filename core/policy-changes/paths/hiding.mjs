import { globToRegExp } from '../../../shared/glob.mjs';
import { resolveLayoutFor } from '../../../languages/typescript/preset/layout.mjs';
import { isUnder } from '../policy-scope.mjs';

const EXCLUSIONS = 'exclude and layout.excludedGlobs';

export function exceptionPathsByRule(exceptions = []) {
  const byRule = new Map();
  for (const { rule, paths } of exceptions) {
    byRule.set(rule, [...(byRule.get(rule) ?? []), ...paths]);
  }
  return byRule;
}

export function keyedExclusions(config) {
  const layout = resolveLayoutFor(config);
  const exclude = config.exclude ?? [];
  return layout.hiddenGlobs.map((glob) => ({
    glob,
    key: exclude.includes(glob) ? 'exclude' : 'layout.excludedGlobs',
  }));
}

export function testRootReclassifier(config) {
  const layout = resolveLayoutFor(config);
  const withoutRoot = new Map(
    layout.testRoots.map((root) => [
      root,
      resolveLayoutFor({
        ...config,
        layout: { ...config.layout, testRoots: layout.testRoots.filter((other) => other !== root) },
      }),
    ]),
  );
  return (file) =>
    layout.isSourceFile(file)
      ? undefined
      : layout.testRoots.find(
          (root) => isUnder(file, root) && withoutRoot.get(root).isSourceFile(file),
        );
}

function globSet(label, [baseGlobs, headGlobs], importable) {
  const base = baseGlobs.map((glob) => globToRegExp(glob));
  const head = headGlobs.map((glob) => globToRegExp(glob));
  return {
    label,
    importable,
    hidesInHead: (file) => head.some((matcher) => matcher.test(file)),
    baseHiders: (basePath) =>
      base
        .filter((matcher) => matcher.test(basePath))
        .map((matcher) => (file) => matcher.test(file)),
  };
}

function exceptionSets(label, [baseExceptions, headExceptions]) {
  const base = exceptionPathsByRule(baseExceptions);
  return [...exceptionPathsByRule(headExceptions)].map(([rule, paths]) =>
    globSet(`${label} for ${rule}`, [base.get(rule) ?? [], paths], false),
  );
}

function testRootSet(baseConfig, headConfig) {
  const base = testRootReclassifier(baseConfig);
  const head = testRootReclassifier(headConfig);
  return {
    label: 'layout.testRoots',
    importable: true,
    hidesInHead: (file) => head(file) !== undefined,
    baseHiders: (basePath) => {
      const root = base(basePath);
      return root === undefined ? [] : [(file) => base(file) === root];
    },
  };
}

export function hidingSets(baseConfig, headConfig, scope) {
  return [
    globSet(
      EXCLUSIONS,
      [keyedExclusions(baseConfig), keyedExclusions(headConfig)].map((entries) =>
        entries.map(({ glob }) => glob),
      ),
      true,
    ),
    ...exceptionSets('exceptions', [baseConfig.exceptions, headConfig.exceptions]),
    ...(scope.usesLayout ? [testRootSet(baseConfig, headConfig)] : []),
  ];
}
