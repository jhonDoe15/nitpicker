import path from 'node:path';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import {
  hasScopePackage,
  readDependencyNames,
  scopePackage,
} from '../../eslint-config/scope-support.mjs';
import { readHeadPolicy, readLayout } from '../../head-policy.mjs';
import { resolveModuleSpecifier } from '../../modules/module-resolution.mjs';
import { sharedFactFindings } from '../../../../../shared/rules/facts/evaluate.mjs';
import { uniqueFindings } from '../../../../../shared/rules/reuse/reuse-finding.mjs';
import { neutralReuseFacts } from './definition-facts.mjs';
import { baselineFileReader, productionFacts, svgFiles } from './project-files.mjs';
import { projectPathOf } from './reuse-paths.mjs';
import { featureLayoutOf } from '../../architecture/strict-layout.mjs';
import { iconAssetFindings } from './rules/icon-assets.mjs';
import { redefinedLibraryComponentFindings } from './rules/library-components.mjs';

const IGNORED = { kind: 'ignored' };

const REUSE_RULES = ['duplicate-definition', 'exported-name-collision', 'sibling-copy-edit'];
const FEATURE_RULES = ['foreign-feature-persistence'];

function projectTarget(target, source) {
  const located = source === undefined ? undefined : { ...target, path: source };
  if (target.kind === 'file') return located ?? IGNORED;
  if (target.kind !== 'package') return target;
  return located ?? { kind: 'package', name: target.name };
}

function projectResolver(projectRoot) {
  const projectPath = projectPathOf(projectRoot);
  return (specifier, from) => {
    const target = resolveModuleSpecifier(specifier, path.join(projectRoot, from));
    return projectTarget(target, target.path === undefined ? undefined : projectPath(target.path));
  };
}

function dependencyReader(projectRoot) {
  const known = new Map();
  return (packageRoot) => {
    if (!known.has(packageRoot)) {
      known.set(
        packageRoot,
        new Set([
          ...readDependencyNames(path.join(projectRoot, packageRoot)),
          ...readDependencyNames(projectRoot),
        ]),
      );
    }
    return known.get(packageRoot);
  };
}

function reactFindings({ facts, context, projectRoot, layout, react }) {
  const iconPackage = react.iconPackage ?? scopePackage(projectRoot, 'icons');
  return [
    ...redefinedLibraryComponentFindings(facts, {
      ...context,
      dependenciesOf: dependencyReader(projectRoot),
    }),
    ...iconAssetFindings(svgFiles(projectRoot, layout), { ...context, iconPackage }),
  ];
}

export function reuseFindings(
  { projectRoot, analyzerName, baselineRoot, baselinePaths = new Map() },
  environment,
) {
  const { exceptions, react, layout: configured } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const resolve = projectResolver(projectRoot);
  const facts = productionFacts(projectRoot, layout);
  const context = { analyzerName, isExcepted: exceptionMatcher(exceptions), resolve };
  const baseline =
    baselineRoot === undefined
      ? undefined
      : { readFile: baselineFileReader({ projectRoot, baselineRoot, baselinePaths }) };
  const inReactScope = react.enabled ?? hasScopePackage(projectRoot, 'react');
  const neutral = neutralReuseFacts(facts, resolve);
  return uniqueFindings([
    ...sharedFactFindings(neutral, {
      language: 'typescript',
      analyzerName,
      rules: REUSE_RULES,
      policy: { exceptions },
      baseline,
    }),
    ...sharedFactFindings(neutral, {
      language: 'typescript',
      analyzerName,
      rules: FEATURE_RULES,
      policy: { exceptions, layout: featureLayoutOf(layout.sourceRoots, configured) },
    }),
    ...(inReactScope ? reactFindings({ facts, context, projectRoot, layout, react }) : []),
  ]);
}
