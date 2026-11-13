import { isDeepStrictEqual } from 'node:util';
import {
  isPlainObject as untypedIsPlainObject,
  listOf as untypedListOf,
} from '../../../../../shared/config.mjs';
import { precedenceLayers as untypedPrecedenceLayers } from '../../../../../shared/conventions/tool-precedence.mjs';
import {
  isDependencyCruiserOwnedOption as untypedIsOwnedOption,
  patternSource as untypedPatternSource,
} from '../../../preset/project-tools/config-values.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type Rule = Readonly<Record<string, unknown>>;

type ResolveOptions = { readonly extensions?: unknown; readonly [key: string]: unknown };

export type CruiseOptions = {
  readonly doNotFollow?: unknown;
  readonly exclude?: unknown;
  readonly enhancedResolveOptions?: ResolveOptions;
  readonly [key: string]: unknown;
};

export type CruiserConfig = {
  readonly forbidden?: readonly Rule[];
  readonly required?: readonly Rule[];
  readonly allowed?: readonly unknown[];
  readonly allowedSeverity?: unknown;
  readonly options?: CruiseOptions;
};

export type GraphLayer = {
  readonly precedence: string[] | undefined;
  readonly config: CruiserConfig;
};

const isPlainObject: (value: unknown) => boolean = untypedIsPlainObject;
const listOf: (value: unknown) => unknown[] = untypedListOf;
const precedenceLayers: (precedence: string[] | undefined) => { readonly nitpickerFirst: boolean } =
  untypedPrecedenceLayers;
const isDependencyCruiserOwnedOption: (key: string) => boolean = untypedIsOwnedOption;
const patternSource: (pattern: unknown) => unknown = untypedPatternSource;

function pathsOf(option: unknown): unknown[] {
  const source = patternSource(option);
  const paths = isPlainObject(source) ? fieldOf(source, 'path') : source;
  return listOf(paths).map(patternSource);
}

function uniqueRules<T>(rules: readonly T[]): T[] {
  return rules.filter(
    (rule, index) => rules.findIndex((other) => isDeepStrictEqual(other, rule)) === index,
  );
}

function mergedRules(high: readonly Rule[] = [], low: readonly Rule[] = []): Rule[] {
  const named = new Map<unknown, Rule>();
  for (const rule of [...low, ...high].filter(({ name }) => typeof name === 'string')) {
    named.set(rule['name'], { ...named.get(rule['name']), ...rule });
  }
  const anonymous = uniqueRules([...high, ...low].filter(({ name }) => typeof name !== 'string'));
  return [...named.values(), ...anonymous];
}

function ruleLists(high: CruiserConfig, low: CruiserConfig): CruiserConfig {
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

function projectOptions(options: CruiseOptions = {}): CruiseOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key]) => !isDependencyCruiserOwnedOption(key)),
  );
}

function doNotFollow(policy: CruiseOptions = {}, project: CruiseOptions = {}): CruiseOptions {
  const paths = [...pathsOf(policy.doNotFollow), ...pathsOf(project.doNotFollow)];
  const types = [
    ...new Set([
      ...listOf(fieldOf(policy.doNotFollow, 'dependencyTypes')),
      ...listOf(fieldOf(project.doNotFollow, 'dependencyTypes')),
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

function mergedOptions(
  policy: CruiseOptions = {},
  project: CruiseOptions = {},
  { nitpickerFirst }: { readonly nitpickerFirst: boolean },
): CruiseOptions {
  const owned = projectOptions(project);
  const [low, high] = nitpickerFirst ? [owned, policy] : [policy, owned];
  return {
    ...low,
    ...high,
    ...Object.fromEntries(
      Object.entries(policy).filter(([key]) => isDependencyCruiserOwnedOption(key)),
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

export function layeredDependencyCruiserConfig(
  policy: CruiserConfig,
  layer: GraphLayer | undefined,
): CruiserConfig {
  if (layer === undefined) {
    return policy;
  }
  const project = layer.config;
  const { nitpickerFirst } = precedenceLayers(layer.precedence);
  const [high, low] = nitpickerFirst ? [policy, project] : [project, policy];
  return {
    ...ruleLists(high, low),
    options: mergedOptions(policy.options, project.options, { nitpickerFirst }),
  };
}

export function projectExcludePaths(layer: GraphLayer | undefined): unknown[] {
  return layer === undefined ? [] : pathsOf(layer.config.options?.exclude);
}
