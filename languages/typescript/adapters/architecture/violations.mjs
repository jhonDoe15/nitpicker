import path from 'node:path';
import { applyAreaExceptions } from '../exceptions/area-exceptions.mjs';

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

export function normalizedRelativePath(value, context) {
  const normalizedPath = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (
    normalizedPath.length === 0 ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new Error(`${context} must stay within the analyzed snapshot`);
  }
  return normalizedPath;
}

export function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

export function architectureFindings(report, analyzerName) {
  return applyAreaExceptions(normalizeArchitectureViolations(report, analyzerName));
}
