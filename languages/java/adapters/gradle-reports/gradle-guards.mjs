import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { runPermits } from '../../builds/classes/class-permits.mjs';
import { runJavacLint } from '../../builds/lint/javac-lint-runner.mjs';

const GUARDS_PLAN = 'guards-plan.json';

export function runGuardPlan(reportDir, { baselineRoot }) {
  const planFile = path.join(reportDir, GUARDS_PLAN);
  if (!existsSync(planFile)) {
    return;
  }
  const plan = JSON.parse(readFileSync(planFile, 'utf8'), (_, value) => value ?? undefined);
  runPermits({ classDirectories: plan.classDirectories, reportDir });
  runJavacLint(plan.lint, { reportDir, baselineRoot });
}

export function main([reportDir, baselineRoot]) {
  runGuardPlan(reportDir, { baselineRoot });
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2));
}
