import path from 'node:path';
import { readHeadPolicy, readLayout } from '../../head-policy.mts';
import { resolveModuleSpecifier } from '../../modules/module-resolution.mts';
import { sharedFactFindings as untypedSharedFactFindings } from '../../../../../shared/rules/facts/evaluate.mts';
import { importSourceText, neutralReuseFacts } from './definition-facts.mts';
import { baselineFileReader, productionFacts, svgFiles } from './project-files.mts';
import { projectPathOf } from './reuse-paths.mts';
import { typescriptFeatureLayout } from '../../coupling/feature-layout.mts';
import { iconAssetFindings } from './rules/icon-assets.mts';
import { redefinedLibraryComponentFindings } from './rules/library-components.mts';
import {
  exceptionMatcher,
  hasScopePackage,
  readDependencyNames,
  scopePackage,
  uniqueFindings,
} from './typed/reuse-views.mts';
import type { HeadPolicy } from '../../typed/head-policy-types.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import type {
  ModuleResolution,
  NeutralFacts,
  Resolve,
  ReuseFact,
  ReuseLayout,
} from './typed/reuse-types.mts';

const sharedFactFindings: (
  facts: NeutralFacts,
  options: {
    readonly language: string;
    readonly analyzerName: string;
    readonly rules: readonly string[];
    readonly policy: unknown;
    readonly baseline?: unknown;
  },
) => Finding[] = untypedSharedFactFindings;

const IGNORED: ModuleResolution = { kind: 'ignored' };

const REUSE_RULES = [
  'duplicate-definition',
  'exported-name-collision',
  'sibling-copy-edit',
  'near-duplicate',
  'duplicate-branch',
  'result-slip',
];
const FEATURE_RULES = ['foreign-feature-persistence'];

type RuleContext = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: readonly string[]) => boolean;
  readonly resolve: Resolve;
};

function projectTarget(target: ModuleResolution, source: string | undefined): ModuleResolution {
  const located = source === undefined ? undefined : { ...target, path: source };
  if (target.kind === 'file') {
    return located ?? IGNORED;
  }
  if (target.kind !== 'package') {
    return target;
  }
  return (
    located ??
    (target.name === undefined ? { kind: 'package' } : { kind: 'package', name: target.name })
  );
}

function projectResolver(projectRoot: string): Resolve {
  const projectPath = projectPathOf(projectRoot);
  return (specifier, from) => {
    const target = resolveModuleSpecifier(specifier, path.join(projectRoot, from));
    return projectTarget(target, target.path === undefined ? undefined : projectPath(target.path));
  };
}

function dependencyReader(projectRoot: string): (packageRoot: string) => ReadonlySet<string> {
  const known = new Map<string, ReadonlySet<string>>();
  return (packageRoot) => {
    const cached = known.get(packageRoot);
    if (cached !== undefined) {
      return cached;
    }
    const names = new Set([
      ...readDependencyNames(path.join(projectRoot, packageRoot)),
      ...readDependencyNames(projectRoot),
    ]);
    known.set(packageRoot, names);
    return names;
  };
}

function reactFindings({
  facts,
  context,
  projectRoot,
  layout,
  react,
}: {
  readonly facts: readonly ReuseFact[];
  readonly context: RuleContext;
  readonly projectRoot: string;
  readonly layout: ReuseLayout;
  readonly react: HeadPolicy['react'];
}): Finding[] {
  const configuredIcon = fieldOf(react, 'iconPackage');
  const iconPackage =
    typeof configuredIcon === 'string' ? configuredIcon : scopePackage(projectRoot, 'icons');
  return [
    ...redefinedLibraryComponentFindings(facts, {
      ...context,
      dependenciesOf: dependencyReader(projectRoot),
    }),
    ...iconAssetFindings(svgFiles(projectRoot, layout), { ...context, iconPackage }),
  ];
}

export function reuseFindings(
  {
    projectRoot,
    analyzerName,
    baselineRoot,
    baselinePaths = new Map<string, string>(),
  }: {
    readonly projectRoot: string;
    readonly analyzerName: string;
    readonly baselineRoot?: string | undefined;
    readonly baselinePaths?: ReadonlyMap<string, string> | undefined;
  },
  environment: NodeJS.ProcessEnv,
): Finding[] {
  const { exceptions, react, layout: configured } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const resolve = projectResolver(projectRoot);
  const facts = productionFacts(projectRoot, {
    layout,
    moduleOf: (specifier, file) => importSourceText(resolve(specifier, file), specifier, file),
    environment,
  });
  const context = { analyzerName, isExcepted: exceptionMatcher(exceptions), resolve };
  const baseline =
    baselineRoot === undefined
      ? undefined
      : { readFile: baselineFileReader({ projectRoot, baselineRoot, baselinePaths }) };
  const enabled = react.enabled;
  const inReactScope =
    enabled === undefined || enabled === null
      ? hasScopePackage(projectRoot, 'react')
      : Boolean(enabled);
  const neutral = neutralReuseFacts(facts, resolve);
  const featureLayout = typescriptFeatureLayout(configured, layout.sourceRoots);
  return uniqueFindings([
    ...sharedFactFindings(neutral, {
      language: 'typescript',
      analyzerName,
      rules: REUSE_RULES,
      policy: { exceptions, layout: featureLayout },
      baseline,
    }),
    ...sharedFactFindings(neutral, {
      language: 'typescript',
      analyzerName,
      rules: FEATURE_RULES,
      policy: { exceptions, layout: featureLayout },
    }),
    ...(inReactScope ? reactFindings({ facts, context, projectRoot, layout, react }) : []),
  ]);
}
