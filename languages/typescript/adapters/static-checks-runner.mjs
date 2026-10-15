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
    process.stderr.write(
      `Static quality adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
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
  return normalizeArchitectureViolations(report, options.analyzerName);
}

export function normalizeArchitectureViolations(report, analyzerName) {
  if (!Array.isArray(report?.summary?.violations)) {
    throw new TypeError('dependency-cruiser report is missing summary.violations');
  }
  const occurrences = new Map();
  return report.summary.violations.map((violation, index) => {
    const context = `dependency-cruiser violation ${String(index)}`;
    const rule = requiredString(violation?.rule?.name, `${context}.rule.name`);
    const severity = requiredString(violation?.rule?.severity, `${context}.rule.severity`);
    const from = normalizedRelativePath(requiredString(violation.from, `${context}.from`), context);
    const to = normalizedRelativePath(requiredString(violation.to, `${context}.to`), context);
    const cycle = violation.type === 'cycle' ? canonicalCycle(violation.cycle, context) : undefined;
    const semanticIdentity = cycle === undefined ? `target:${to}` : `cycle:${cycle.join('>')}`;
    const canonicalPath = cycle?.[0] ?? from;
    const occurrenceKey = JSON.stringify([rule, canonicalPath, semanticIdentity]);
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    return {
      tool: analyzerName,
      rule,
      path: canonicalPath,
      identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
      message:
        cycle === undefined
          ? `${from} must not depend on ${to}`
          : `Dependency cycle: ${cycle.join(' -> ')} -> ${cycle[0]}`,
      classification: severity === 'error' ? 'enforceable' : 'descriptive',
    };
  });
}

function canonicalCycle(value, context) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${context}.cycle must contain at least two modules`);
  }
  const names = value.map((item, index) =>
    normalizedRelativePath(
      requiredString(item?.name, `${context}.cycle[${String(index)}].name`),
      context,
    ),
  );
  const rotations = names.map((_, index) => [...names.slice(index), ...names.slice(0, index)]);
  return rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))[0];
}
