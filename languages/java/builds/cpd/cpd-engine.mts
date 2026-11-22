import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  type EngineEnvironment,
  type EngineHooks,
  type EngineLog,
} from '../../../../shared/engine/engine-run.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';

export type CpdEnginePlan = {
  readonly report: string;
  readonly directories: readonly string[];
};

export const CPD_ENGINE_LOG = 'cpd-engine-log.txt';
const ENGINE_USED = 'the engine wrote this report\n';

export function environmentOf(value: unknown): EngineEnvironment {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, setting]) => [
      name,
      typeof setting === 'string' ? setting : undefined,
    ]),
  );
}

export function cpdPlanOf(plan: unknown): CpdEnginePlan {
  return {
    report: String(fieldOf(plan, 'report')),
    directories: textsOf(fieldOf(plan, 'directories')),
  };
}

function leftToCpd(plan: CpdEnginePlan, reason: string, log: EngineLog | undefined): boolean {
  rmSync(plan.report, { force: true });
  writeFileSync(path.join(path.dirname(plan.report), CPD_ENGINE_LOG), `CPD runs: ${reason}\n`);
  log?.write(`nitpicker: the engine did not look for duplicates, PMD CPD does: ${reason}\n`);
  return false;
}

export function cpdOnEngine(
  plan: CpdEnginePlan,
  environment: EngineEnvironment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): boolean {
  const logFile = path.join(path.dirname(plan.report), CPD_ENGINE_LOG);
  rmSync(plan.report, { force: true });
  rmSync(logFile, { force: true });
  const binary = findEngine(environment);
  if (binary === undefined || plan.directories.length === 0) {
    return false;
  }
  const { status, stderr } = run(['cpd', '--report', plan.report, ...plan.directories], {
    binary,
    environment,
  });
  if (status !== 0 || !existsSync(plan.report)) {
    return leftToCpd(plan, stderr.trim() || `exit status ${String(status)}`, log);
  }
  writeFileSync(logFile, ENGINE_USED);
  return true;
}
