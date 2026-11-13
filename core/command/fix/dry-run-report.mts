import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TextOutput } from '../../cli-context.mts';

type PlannedFix = {
  readonly recipe?: string;
  readonly tool?: string;
  readonly safety: string;
  readonly finding?: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly files: readonly string[];
};

export type DryRunPlan = { readonly patch: Buffer; readonly fixes: readonly PlannedFix[] };

const PATCH_FILE = 'fix.patch';
export const FIXES_FILE = 'fixes.json';
const JSON_INDENT = 2;

function fixLine(fix: PlannedFix): string {
  if (fix.finding === undefined) {
    return `${fix.tool ?? 'fixer'} would rewrite ${fix.files.join(', ')}`;
  }
  const { tool, rule, path: name, line } = fix.finding;
  return `${name}:${String(line)} ${tool}/${rule} (${fix.recipe ?? 'recipe'}, ${fix.safety})`;
}

export function reportDryRun(stdout: TextOutput, outputRoot: string, plan: DryRunPlan): void {
  const patchFile = path.join(outputRoot, PATCH_FILE);
  const fixesFile = path.join(outputRoot, FIXES_FILE);
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(patchFile, plan.patch);
  writeFileSync(fixesFile, `${JSON.stringify({ fixes: plan.fixes }, undefined, JSON_INDENT)}\n`);
  const lines = plan.fixes.map((fix) => `  ${fixLine(fix)}\n`).join('');
  stdout.write(
    `Fixes that --fix would apply (dry run, nothing was written to your files): ${String(plan.fixes.length)}\n${lines}`,
  );
  stdout.write(`Patch: ${patchFile}\nFixes: ${fixesFile}\n`);
}

export function clearDryRunOutput(outputRoot: string): void {
  for (const name of [PATCH_FILE, FIXES_FILE]) {
    rmSync(path.join(outputRoot, name), { force: true });
  }
}
