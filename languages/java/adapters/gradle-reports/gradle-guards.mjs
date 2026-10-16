import { existsSync, readFileSync } from 'node:fs';
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

export function runGradleGuards(modules, { baselineRoot }) {
  for (const module of modules) {
    runGuardPlan(module.reportRoot, { baselineRoot });
  }
}
