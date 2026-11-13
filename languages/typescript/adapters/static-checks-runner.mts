import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  type StaticCheckOptions,
  parseArguments,
  requiredString,
  normalizedRelativePath,
} from './static-checks/arguments.mts';
import type { Finding } from './static-checks/shared.mts';
import { runPrettier } from './static-checks/prettier.mts';
import { runTypecheck } from './static-checks/typescript.mts';
import { readLayout } from './typed/head-policy.mts';
import {
  type CruiseReport,
  type CruiseSummary,
  type CruiseViolation,
  applyAreaExceptions,
  existingRoots,
  loadDependencyGraph,
  sharedReachPath,
  withTypeScriptHint,
} from './typed/static-checks.mts';
import { REACH_THROUGH_SHARED_RULE } from '../preset/architecture/strict-boundary-rules.mjs';

type ViolationText = {
  readonly violation: CruiseViolation;
  readonly rule: string;
  readonly from: string;
  readonly to: string;
  readonly cycle: readonly string[] | undefined;
};

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = await runStaticCheck(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (failure) {
    const error = withTypeScriptHint(failure);
    process.stderr.write(`Static quality adapter failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

async function runStaticCheck(options: StaticCheckOptions): Promise<Finding[]> {
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

function runArchitecture(options: StaticCheckOptions): Finding[] {
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
    reportsConfigErrors: true,
  });
  return applyAreaExceptions(normalizeArchitectureViolations(report, options.analyzerName));
}

function reportedViolations(violations: readonly unknown[], modules: unknown): CruiseViolation[] {
  const moduleList: unknown[] = Array.isArray(modules) ? modules : [];
  return violations.map(violationOf).flatMap((violation): CruiseViolation[] => {
    if (nameOf(violation.rule) !== REACH_THROUGH_SHARED_RULE) {
      return [violation];
    }
    const via = sharedReachPath(violation, moduleList);
    return via === undefined ? [] : [{ ...violation, via: via.map((name) => ({ name })) }];
  });
}

export function normalizeArchitectureViolations(
  report: CruiseReport | undefined,
  analyzerName: string,
): Finding[] {
  const violations = report?.summary?.violations;
  if (!Array.isArray(violations)) {
    throw new TypeError('dependency-cruiser report is missing summary.violations');
  }
  const occurrences = new Map<string, number>();
  const comments = ruleComments(report?.summary);
  return reportedViolations(violations, report?.modules).map((violation, index) => {
    const context = `dependency-cruiser violation ${String(index)}`;
    const rule = requiredString(nameOf(violation.rule), `${context}.rule.name`);
    const severity = requiredString(severityOf(violation.rule), `${context}.rule.severity`);
    const from = normalizedRelativePath(requiredString(violation.from, `${context}.from`), context);
    const to = displayedPath(requiredString(violation.to, `${context}.to`));
    const cycle = violation.type === 'cycle' ? canonicalCycle(violation.cycle) : undefined;
    const semanticIdentity = cycle === undefined ? `target:${to}` : `cycle:${cycle.join('>')}`;
    const first = cycle?.[0];
    const canonicalPath = first !== undefined && isInSnapshot(first) ? first : from;
    const occurrenceKey = JSON.stringify([rule, canonicalPath, semanticIdentity]);
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    return {
      tool: analyzerName,
      rule,
      path: canonicalPath,
      identity: `${semanticIdentity}|occurrence:${String(occurrence)}`,
      message: withComment(violationText({ violation, rule, from, to, cycle }), comments.get(rule)),
      classification: severity === 'error' ? 'enforceable' : 'descriptive',
    };
  });
}

function violationText({ violation, rule, from, to, cycle }: ViolationText): string {
  if (cycle !== undefined) {
    return `Dependency cycle: ${cycle.join(' -> ')} -> ${cycle[0] ?? ''}`;
  }
  return violation.type === 'module' && from === to
    ? `${from} breaks the ${rule} rule`
    : `${from} must not depend on ${to}${viaText(violation.via)}`;
}

function displayedPath(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
}

function isInSnapshot(value: string): boolean {
  return !value.startsWith('../') && !path.posix.isAbsolute(value) && !/^[A-Za-z]:\//.test(value);
}

function canonicalCycle(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const items: unknown[] = value;
  const names = items.map(nameOf);
  if (!names.every((name): name is string => typeof name === 'string' && name.length > 0)) {
    return undefined;
  }
  const paths = names.map(displayedPath);
  const rotations = paths.map((_, index) => [...paths.slice(index), ...paths.slice(0, index)]);
  const inSnapshot = rotations.filter(([first]) => first !== undefined && isInSnapshot(first));
  return (inSnapshot.length > 0 ? inSnapshot : rotations).sort((left, right) =>
    left.join('\0').localeCompare(right.join('\0')),
  )[0];
}

function ruleComments(summary: CruiseSummary | undefined): Map<string, string> {
  const rules: unknown[] = [
    ...(summary?.ruleSetUsed?.forbidden ?? []),
    ...(summary?.ruleSetUsed?.required ?? []),
  ];
  return new Map(
    rules.flatMap((rule): [string, string][] => {
      const name = nameOf(rule);
      const comment = commentOf(rule);
      return typeof name === 'string' && typeof comment === 'string' ? [[name, comment]] : [];
    }),
  );
}

function violationOf(value: unknown): CruiseViolation {
  return typeof value === 'object' && value !== null ? value : {};
}

function severityOf(rule: unknown): unknown {
  return typeof rule === 'object' && rule !== null && 'severity' in rule
    ? rule.severity
    : undefined;
}

function commentOf(rule: unknown): unknown {
  return typeof rule === 'object' && rule !== null && 'comment' in rule ? rule.comment : undefined;
}

function nameOf(item: unknown): unknown {
  return typeof item === 'object' && item !== null && 'name' in item ? item.name : undefined;
}

function withComment(message: string, comment: string | undefined): string {
  return comment === undefined ? message : `${message}. ${comment}`;
}

function viaText(via: unknown): string {
  if (!Array.isArray(via) || via.length < 2) {
    return '';
  }
  const items: unknown[] = via;
  const steps = items.slice(0, -1).map((step) => {
    const name = nameOf(step);
    return typeof name === 'string' ? displayedPath(name) : '?';
  });
  return ` through ${steps.join(' -> ')}`;
}
