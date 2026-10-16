import path from 'node:path';
import { exceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import {
  hasScopePackage,
  readDependencyNames,
  scopePackage,
} from '../../eslint-config/scope-support.mjs';
import { readHeadPolicy, readLayout } from '../../head-policy.mjs';
import { resolveModuleSpecifier } from '../../modules/module-resolution.mjs';
import { resolvedDefinitions } from './definition-facts.mjs';
import { uniqueFindings } from './finding.mjs';
import { productionFacts, svgFiles } from './project-files.mjs';
import { projectPathOf } from './reuse-paths.mjs';
import { duplicateDefinitionFindings } from './rules/duplicate-definitions.mjs';
import { iconAssetFindings } from './rules/icon-assets.mjs';
import { redefinedLibraryComponentFindings } from './rules/library-components.mjs';
import { exportedNameCollisionFindings } from './rules/name-collisions.mjs';

const IGNORED = { kind: 'ignored' };

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

export function reuseFindings(projectRoot, analyzerName, environment = process.env) {
  const { exceptions, react } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const resolve = projectResolver(projectRoot);
  const facts = resolvedDefinitions(productionFacts(projectRoot, layout), resolve);
  const context = { analyzerName, isExcepted: exceptionMatcher(exceptions), resolve };
  const inReactScope = react.enabled ?? hasScopePackage(projectRoot, 'react');
  return uniqueFindings([
    ...duplicateDefinitionFindings(facts, context),
    ...exportedNameCollisionFindings(facts, context),
    ...(inReactScope ? reactFindings({ facts, context, projectRoot, layout, react }) : []),
  ]);
}
