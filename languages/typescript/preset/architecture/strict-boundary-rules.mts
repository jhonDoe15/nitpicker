import { rootPattern } from '../layout/source-root/root-paths.mts';
import { layoutFeatures, testFilePaths } from './strict-layout.mts';
import { isTypeOnlyDependency } from '../dependency-graph/cruise.mts';
import { canonicalRule as untypedCanonicalRule } from '../../../../shared/exceptions/rule-names.mjs';
import { globToRegExpSource as untypedGlobToRegExpSource } from '../../../../shared/paths/glob.mjs';
import { readHeadPolicy, readLayout as untypedReadLayout } from '../head-policy.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import {
  idAndRandomLibraries,
  loggers,
  networkAndDatabaseClients,
  resolvedPackagePattern,
} from './domain-packages.mts';
import type {
  BoundaryException,
  BoundaryRule,
  ReachModule,
  ReachViolation,
} from './typed/rule-types.mts';

const canonicalRule: (rule: string) => string = untypedCanonicalRule;
const globToRegExpSource: (glob: string) => string = untypedGlobToRegExpSource;
const readLayout: () => { readonly sourceRoots: readonly string[]; readonly javascript: boolean } =
  untypedReadLayout;

const layout = readLayout();
const sourceRoot = rootPattern(layout.sourceRoots);

export function publicIndexFor({ javascript }: { readonly javascript: boolean }): string {
  return javascript
    ? 'public index.js or index.mjs (src/main/features/<name>/index.js)'
    : 'public index.ts (src/main/features/<name>/index.ts)';
}

const publicIndex = publicIndexFor(layout);

const { featureRoot, feature, shared, compositionRoot } = layoutFeatures;
const codeFile = '\\.[cm]?[jt]sx?$';

const EXCEPTION_ROUTE =
  ' An exception fits only when it is deliberate; its paths are the importing files.';

const pureNodeModules = [
  'path',
  'url',
  'util',
  'assert',
  'buffer',
  'events',
  'string_decoder',
  'punycode',
  'querystring',
];

const pureNodeModulePattern = `^(?:node:)?(?:${pureNodeModules.join('|')})(?:/(?:posix|win32|strict|types))?$`;

const nodeIoModules = [
  'fs',
  'child_process',
  'net',
  'http',
  'https',
  'http2',
  'tls',
  'dgram',
  'dns',
  'cluster',
  'worker_threads',
  'os',
  'readline',
  'crypto',
  'perf_hooks',
  'timers',
  'zlib',
];

const reachableIoPatterns = [
  `^(?:node:)?(?:${nodeIoModules.join('|')})(?:$|/)`,
  resolvedPackagePattern([...networkAndDatabaseClients, ...loggers]),
];

const domain = { path: `${feature}/domain/`, pathNot: testFilePaths };

const baseBoundaryRules: readonly BoundaryRule[] = [
  {
    name: 'feature-internals-only-through-index',
    severity: 'error',
    comment: `Import a feature only through its ${publicIndex}, not its internal files.`,
    from: { path: `(?:^|/)${sourceRoot}`, pathNot: `${featureRoot}/` },
    to: { path: `${featureRoot}/[^/]+/(?!index${codeFile})` },
  },
  {
    name: 'features-do-not-import-other-feature-internals',
    severity: 'error',
    comment: `Import another feature only through its ${publicIndex}, not its internal files.`,
    from: { path: `${featureRoot}/([^/]+)/` },
    to: {
      path: `${featureRoot}/[^/]+/(?!index${codeFile})`,
      pathNot: `${featureRoot}/$1/`,
    },
  },
  {
    name: 'shared-does-not-import-features',
    severity: 'error',
    comment:
      'Shared code does not import features. Move the dependency into the feature, or pass it in as a parameter from the composition root.',
    from: { path: shared },
    to: { path: featureRoot },
  },
  {
    name: 'features-do-not-import-composition-root',
    severity: 'error',
    comment:
      'Features do not import the composition root. Accept the dependency as a parameter; only the composition root wires features together.',
    from: { path: featureRoot },
    to: { path: compositionRoot },
  },
  {
    name: 'domain-does-not-import-adapters',
    severity: 'error',
    comment:
      'domain/ stays pure and may not import adapters/. Define the dependency as a type in domain/ and let adapters/ implement it.',
    from: domain,
    to: { path: `${feature}/adapters/` },
  },
  {
    name: 'domain-does-not-import-node-io',
    severity: 'error',
    comment:
      'domain/ may import only pure Node modules (path, url, util, assert, buffer, events, string_decoder, punycode, querystring, and their subpaths such as path/posix). Do the I/O in adapters/ and pass the result in as a parameter.',
    from: domain,
    to: {
      dependencyTypes: ['core'],
      pathNot: pureNodeModulePattern,
    },
  },
  {
    name: 'domain-does-not-import-network-or-database-clients',
    severity: 'error',
    comment:
      'domain/ may not import network or database clients. Call the client from adapters/ and pass the data into domain/ as a parameter.',
    from: domain,
    to: { path: resolvedPackagePattern(networkAndDatabaseClients) },
  },
  {
    name: 'domain-does-not-import-the-logger',
    severity: 'error',
    comment:
      'domain/ may not import the logger. Return a result describing what happened and let adapters/ log it.',
    from: domain,
    to: {
      path: [
        resolvedPackagePattern(loggers),
        `(?:^|/)(?:logger|logging|log)(?:/index)?${codeFile}`,
        '(?:^|/)(?:logger|logging)/',
      ],
    },
  },
  {
    name: 'domain-does-not-import-module-state',
    severity: 'error',
    comment:
      'domain/ may not import module state (state/, *-state, *-store files). Receive the state as a parameter and return the new value.',
    from: domain,
    to: {
      path: [`(?:^|/)state/`, `(?:^|/)[^/]*[.-](?:state|store)${codeFile}`],
    },
  },
  {
    name: 'domain-does-not-import-id-libraries',
    severity: 'error',
    comment:
      'domain/ may not import ID or random-data libraries (uuid, nanoid, cuid, ulid, faker). Take the ID as a parameter from adapters/.',
    from: domain,
    to: { path: resolvedPackagePattern(idAndRandomLibraries) },
  },
  {
    name: 'domain-does-not-reach-io-through-shared',
    severity: 'error',
    comment:
      'domain/ reaches Node I/O or a client through a shared/ module it imports. Move that dependency out of the shared module, or do the work in adapters/ and pass the result into domain/ as a parameter.',
    from: domain,
    to: { path: reachableIoPatterns, reachable: true },
  },
];

function withExceptionRoute(rule: BoundaryRule): BoundaryRule {
  return rule.name.startsWith('domain-')
    ? { ...rule, comment: `${rule.comment}${EXCEPTION_ROUTE}` }
    : rule;
}

function withExceptions(
  rule: BoundaryRule,
  exceptions: readonly BoundaryException[],
): BoundaryRule {
  const lifted = exceptions
    .filter((exception) => canonicalRule(exception.rule) === rule.name)
    .flatMap(({ paths }) => paths.map(globToRegExpSource));
  if (lifted.length === 0) {
    return rule;
  }
  const existing = [rule.from.pathNot ?? []].flat();
  return { ...rule, from: { ...rule.from, pathNot: [...existing, ...lifted] } };
}

function boundaryExceptions(exceptions: readonly unknown[]): BoundaryException[] {
  return exceptions.map((exception) => ({
    rule: textOf(fieldOf(exception, 'rule')),
    paths: textsOf(fieldOf(exception, 'paths')),
  }));
}

export function strictBoundaryRulesFor(exceptions: readonly BoundaryException[]): BoundaryRule[] {
  return baseBoundaryRules.map(withExceptionRoute).map((rule) => withExceptions(rule, exceptions));
}

export const strictBoundaryRules: BoundaryRule[] = strictBoundaryRulesFor(
  boundaryExceptions(readHeadPolicy().exceptions),
);

export const REACH_THROUGH_SHARED_RULE = 'domain-does-not-reach-io-through-shared';

const featureOrCompositionRoot = new RegExp(`${featureRoot}/|${compositionRoot}`);

function runtimeTargets(modules: ReadonlyMap<string, ReachModule>, source: string): string[] {
  return (modules.get(source)?.dependencies ?? [])
    .filter((dependency) => !isTypeOnlyDependency(dependency))
    .map(({ resolved }) => resolved);
}

export function sharedReachPath(
  violation: ReachViolation,
  moduleList: readonly ReachModule[],
): string[] | undefined {
  const modules = new Map(moduleList.map((module) => [module.source, module]));
  const firstSteps = runtimeTargets(modules, violation.from).filter(
    (step) => step !== violation.to && !featureOrCompositionRoot.test(step),
  );
  const seen = new Set([violation.from, ...firstSteps]);
  const pending = firstSteps.map((step) => [step]);
  for (const candidate of pending) {
    const last = candidate.at(-1);
    if (last === violation.to) {
      return candidate;
    }
    const next = [...new Set(runtimeTargets(modules, String(last)))].filter(
      (step) => !seen.has(step),
    );
    for (const step of next) {
      seen.add(step);
      pending.push([...candidate, step]);
    }
  }
  return undefined;
}
