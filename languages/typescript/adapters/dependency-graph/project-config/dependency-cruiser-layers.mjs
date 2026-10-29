import { isDeepStrictEqual } from 'node:util';
import { precedenceLayers } from '../../../../../shared/conventions/tool-precedence.mjs';
import {
  DEPENDENCY_CRUISER_OWNED_OPTIONS,
  listOf,
  patternSource,
} from '../../../preset/project-tools/config-values.mjs';

function pathsOf(option) {
  const source = patternSource(option);
  const paths =
    typeof source === 'object' && source !== null && !Array.isArray(source) ? source.path : source;
  return listOf(paths).map(patternSource);
}

function uniqueRules(rules) {
  return rules.filter(
    (rule, index) => rules.findIndex((other) => isDeepStrictEqual(other, rule)) === index,
  );
}

function mergedRules(high = [], low = []) {
  const named = new Map();
  for (const rule of [...low, ...high].filter(({ name }) => typeof name === 'string')) {
    named.set(rule.name, { ...named.get(rule.name), ...rule });
  }
  const anonymous = uniqueRules([...high, ...low].filter(({ name }) => typeof name !== 'string'));
  return [...named.values(), ...anonymous];
}

function ruleLists(high, low) {
  const forbidden = mergedRules(high.forbidden, low.forbidden);
  const required = mergedRules(high.required, low.required);
  const allowed = uniqueRules([...(high.allowed ?? []), ...(low.allowed ?? [])]);
  const allowedSeverity = high.allowedSeverity ?? low.allowedSeverity;
  return {
    forbidden,
    required,
    ...(allowed.length === 0
      ? {}
      : { allowed, ...(allowedSeverity === undefined ? {} : { allowedSeverity }) }),
  };
}

function projectOptions(options = {}) {
  return Object.fromEntries(
    Object.entries(options).filter(([key]) => !DEPENDENCY_CRUISER_OWNED_OPTIONS.has(key)),
  );
}

function doNotFollow(policy = {}, project = {}) {
  const paths = [...pathsOf(policy.doNotFollow), ...pathsOf(project.doNotFollow)];
  const types = [
    ...new Set([
      ...listOf(policy.doNotFollow?.dependencyTypes),
      ...listOf(project.doNotFollow?.dependencyTypes),
    ]),
  ];
  return paths.length + types.length === 0
    ? {}
    : {
        doNotFollow: {
          ...(paths.length === 0 ? {} : { path: paths.join('|') }),
          ...(types.length === 0 ? {} : { dependencyTypes: types }),
        },
      };
}

function mergedOptions(policy = {}, project = {}, nitpickerFirst) {
  const owned = projectOptions(project);
  const [low, high] = nitpickerFirst ? [owned, policy] : [policy, owned];
  return {
    ...low,
    ...high,
    ...Object.fromEntries(
      Object.entries(policy).filter(([key]) => DEPENDENCY_CRUISER_OWNED_OPTIONS.has(key)),
    ),
    ...doNotFollow(policy, project),
    ...(policy.enhancedResolveOptions === undefined && owned.enhancedResolveOptions === undefined
      ? {}
      : {
          enhancedResolveOptions: {
            ...low.enhancedResolveOptions,
            ...high.enhancedResolveOptions,
            ...(policy.enhancedResolveOptions?.extensions === undefined
              ? {}
              : { extensions: policy.enhancedResolveOptions.extensions }),
          },
        }),
  };
}

export function layeredDependencyCruiserConfig(policy, layer) {
  if (layer === undefined) {
    return policy;
  }
  const project = layer.config;
  const { nitpickerFirst } = precedenceLayers(layer.precedence);
  const [high, low] = nitpickerFirst ? [policy, project] : [project, policy];
  return {
    ...ruleLists(high, low),
    options: mergedOptions(policy.options, project.options, nitpickerFirst),
  };
}

export function projectExcludePaths(layer) {
  return layer === undefined ? [] : pathsOf(layer.config.options?.exclude);
}
