import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { runPermits } from '../../builds/classes/class-permits.mts';
import { runJavacLint } from '../../builds/lint/javac-lint-runner.mjs';

const GUARDS_PLAN = 'guards-plan.json';

type GuardsPlan = { readonly classDirectories?: unknown; readonly lint?: unknown };

function guardsPlan(value: unknown): GuardsPlan {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${GUARDS_PLAN} must hold an object`);
  }
  return value;
}

export function runGuardPlan(
  reportDir: string,
  { baselineRoot }: { readonly baselineRoot: string | undefined },
): void {
  const planFile = path.join(reportDir, GUARDS_PLAN);
  if (!existsSync(planFile)) {
    return;
  }
  const plan = guardsPlan(
    JSON.parse(readFileSync(planFile, 'utf8'), (_, value: unknown) => value ?? undefined),
  );
  runPermits({ classDirectories: plan.classDirectories, reportDir });
  runJavacLint(plan.lint, { reportDir, baselineRoot });
}

export function main([reportDir, baselineRoot]: readonly string[]): void {
  if (reportDir === undefined) {
    throw new TypeError('gradle-guards needs <report dir> [<base project root>]');
  }
  runGuardPlan(reportDir, { baselineRoot });
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
