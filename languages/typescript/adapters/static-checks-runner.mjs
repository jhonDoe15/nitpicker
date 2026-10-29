import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  parseArguments,
  requiredString,
  normalizedRelativePath,
} from './static-checks/arguments.mjs';
import { runPrettier } from './static-checks/prettier.mjs';
import { runTypecheck } from './static-checks/typescript.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { existingRoots } from '../preset/layout.mjs';
import { loadDependencyGraph } from './dependency-graph/project-dependency-graph.mjs';
import { applyAreaExceptions } from './exceptions/area-exceptions.mjs';
import {
  REACH_THROUGH_SHARED_RULE,
  sharedReachPath,
} from '../preset/architecture/strict-boundary-rules.mjs';
import { typescriptFailureText } from './hints/tool-failure-hint.mjs';

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = await runStaticCheck(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(`Static quality adapter failed: ${typescriptFailureText(error)}\n`);
    process.exitCode = 2;
  }
}

async function runStaticCheck(options) {
  switch (options.kind) {
    case 'prettier':
      return runPrettier(options);
    case 'typecheck':
      return runTypecheck(options);
    case 'architecture':
      return runArchitecture(options);
    default:
      throw new Error(`Unsupported static check: ${options.kind}`);
  }
}

function runArchitecture(options) {
  if (options.patterns.length === 0) {
    throw new Error('Architecture requires at least one --pattern');
  }
  const layout = readLayout();
  if (layout.projectCodeFiles(options.projectRoot).length === 0) return [];
  const patterns = existingRoots(options.projectRoot, options.patterns);
  if (patterns.length === 0) return [];
  const report = loadDependencyGraph({
    projectRoot: options.projectRoot,
    policyRoot: options.policyRoot,
    liveProjectRoot: options.liveProjectRoot,
    patterns,
    exclude: options.exclude,
    includeOnly: options.includeOnly,
    configRelativePath: options.configRelativePath,
  });
  return applyAreaExceptions(normalizeArchitectureViolations(report, options.analyzerName));
}

function reportedViolations(report) {
  const modules = Array.isArray(report.modules) ? report.modules : [];
  return report.summary.violations.flatMap((violation) => {
    if (violation?.rule?.name !== REACH_THROUGH_SHARED_RULE) {
      return [violation];
    }
    const via = sharedReachPath(violation, modules);
    return via === undefined ? [] : [{ ...violation, via: via.map((name) => ({ name })) }];
  });
}

export function normalizeArchitectureViolations(report, analyzerName) {
  if (!Array.isArray(report?.summary?.violations)) {
    throw new TypeError('dependency-cruiser report is missing summary.violations');
  }
  const occurrences = new Map();
  const comments = ruleComments(report);
  return reportedViolations(report).map((violation, index) => {
    const context = `dependency-cruiser violation ${String(index)}`;
    const rule = requiredString(violation?.rule?.name, `${context}.rule.name`);
    const severity = requiredString(violation?.rule?.severity, `${context}.rule.severity`);
    const from = normalizedRelativePath(requiredString(violation.from, `${context}.from`), context);
    const to = displayedPath(requiredString(violation.to, `${context}.to`));
    const cycle = violation.type === 'cycle' ? canonicalCycle(violation.cycle, context) : undefined;
    const semanticIdentity = cycle === undefined ? `target:${to}` : `cycle:${cycle.join('>')}`;
    const canonicalPath = cycle !== undefined && isInSnapshot(cycle[0]) ? cycle[0] : from;
    const occurrenceKey = JSON.stringify([rule, canonicalPath, semanticIdentity]);
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    return {
      tool: analyzerName,
      rule,
      path: canonicalPath,
      identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
      message: withComment(
        cycle === undefined
          ? `${from} must not depend on ${to}${viaText(violation.via)}`
          : `Dependency cycle: ${cycle.join(' -> ')} -> ${cycle[0]}`,
        comments.get(rule),
      ),
      classification: severity === 'error' ? 'enforceable' : 'descriptive',
    };
  });
}

function displayedPath(value) {
  return path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
}

function isInSnapshot(value) {
  return !value.startsWith('../') && !path.posix.isAbsolute(value) && !/^[A-Za-z]:\//.test(value);
}

function canonicalCycle(value, context) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${context}.cycle must contain at least two modules`);
  }
  const names = value.map((item, index) =>
    displayedPath(requiredString(item?.name, `${context}.cycle[${String(index)}].name`)),
  );
  const rotations = names.map((_, index) => [...names.slice(index), ...names.slice(0, index)]);
  const inSnapshot = rotations.filter(([first]) => isInSnapshot(first));
  return (inSnapshot.length > 0 ? inSnapshot : rotations).sort((left, right) =>
    left.join('\0').localeCompare(right.join('\0')),
  )[0];
}

function ruleComments(report) {
  const rules = report.summary.ruleSetUsed?.forbidden ?? [];
  return new Map(
    rules
      .filter((rule) => typeof rule?.name === 'string' && typeof rule.comment === 'string')
      .map((rule) => [rule.name, rule.comment]),
  );
}

function withComment(message, comment) {
  return comment === undefined ? message : `${message}. ${comment}`;
}

function viaText(via) {
  if (!Array.isArray(via) || via.length < 2) {
    return '';
  }
  const steps = via
    .slice(0, -1)
    .map((step) => (typeof step?.name === 'string' ? displayedPath(step.name) : '?'));
  return ` through ${steps.join(' -> ')}`;
}
