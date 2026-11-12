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
import { readLayout } from '../preset/head-policy.mjs';
import { existingRoots } from '../preset/layout.mjs';
import { loadDependencyGraph } from './dependency-graph/project-dependency-graph.mjs';
import { applyAreaExceptions } from './exceptions/area-exceptions.mjs';
import {
  REACH_THROUGH_SHARED_RULE,
  sharedReachPath,
} from '../preset/architecture/strict-boundary-rules.mjs';
import { withTypeScriptHint } from './hints/tool-failure-hint.mjs';

type CruiseRule = {
  readonly name?: unknown;
  readonly severity?: unknown;
  readonly comment?: unknown;
};

type CruiseViolation = {
  readonly rule?: CruiseRule;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly type?: unknown;
  readonly cycle?: unknown;
  readonly via?: unknown;
};

type CruiseSummary = {
  readonly violations?: unknown;
  readonly ruleSetUsed?: {
    readonly forbidden?: readonly CruiseRule[];
    readonly required?: readonly CruiseRule[];
  };
};

export type CruiseReport = { readonly summary?: CruiseSummary; readonly modules?: unknown };

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
    process.stderr.write(
      `Static quality adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
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
  const report: CruiseReport = loadDependencyGraph({
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

function reportedViolations(
  violations: readonly CruiseViolation[],
  modules: unknown,
): CruiseViolation[] {
  const moduleList: unknown[] = Array.isArray(modules) ? modules : [];
  return violations.flatMap((violation): CruiseViolation[] => {
    if (violation?.rule?.name !== REACH_THROUGH_SHARED_RULE) {
      return [violation];
    }
    const via: string[] | undefined = sharedReachPath(violation, moduleList);
    return via === undefined ? [] : [{ ...violation, via: via.map((name) => ({ name })) }];
  });
}

export function normalizeArchitectureViolations(
  report: CruiseReport | undefined,
  analyzerName: string,
): Finding[] {
  const violations: unknown = report?.summary?.violations;
  if (!Array.isArray(violations)) {
    throw new TypeError('dependency-cruiser report is missing summary.violations');
  }
  const occurrences = new Map<string, number>();
  const comments = ruleComments(report?.summary);
  return reportedViolations(violations, report?.modules).map((violation, index) => {
    const context = `dependency-cruiser violation ${String(index)}`;
    const rule = requiredString(violation?.rule?.name, `${context}.rule.name`);
    const severity = requiredString(violation?.rule?.severity, `${context}.rule.severity`);
    const from = normalizedRelativePath(requiredString(violation.from, `${context}.from`), context);
    const to = displayedPath(requiredString(violation.to, `${context}.to`));
    const cycle = violation.type === 'cycle' ? canonicalCycle(violation.cycle, context) : undefined;
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

function canonicalCycle(value: unknown, context: string): string[] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError(`${context}.cycle must contain at least two modules`);
  }
  const items: unknown[] = value;
  const names = items.map((item, index) =>
    displayedPath(requiredString(nameOf(item), `${context}.cycle[${String(index)}].name`)),
  );
  const rotations = names.map((_, index) => [...names.slice(index), ...names.slice(0, index)]);
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
