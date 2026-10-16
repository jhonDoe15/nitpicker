import path from 'node:path';
import { exceptionMatcher } from '../../../../../shared/rules/file-limits.mjs';
import { readHeadPolicy, readLayout } from '../../head-policy.mjs';
import { resolveModuleSpecifier } from '../../modules/module-resolution.mjs';
import { resolvedDefinitions } from './definition-facts.mjs';
import { uniqueFindings } from './finding.mjs';
import { productionFacts } from './project-files.mjs';
import { projectPathOf } from './reuse-paths.mjs';

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

export function reuseFindings(projectRoot, analyzerName, environment = process.env) {
  const { exceptions } = readHeadPolicy(environment);
  const layout = readLayout(environment);
  const resolve = projectResolver(projectRoot);
  const facts = resolvedDefinitions(productionFacts(projectRoot, layout), resolve);
  const context = { analyzerName, isExcepted: exceptionMatcher(exceptions), resolve };
  return uniqueFindings([
  ]);
}
