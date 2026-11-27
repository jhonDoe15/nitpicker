import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  type EngineCall,
  type EngineEnvironment as Environment,
  type EngineHooks,
} from '../../../../shared/engine/engine-run.mts';
import { fieldOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import {
  argumentSetOf,
  generatedRoots,
  lookupEntries,
  releaseOf,
  type ArgumentSet,
} from './engine-arguments.mts';
import { engineChecksFor, NULL_AWAY, wholeReason, type EngineChecks } from './engine-checks.mts';
import {
  diagnosticsOf as engineDiagnostics,
  ENGINE_REPORT,
  type EngineDiagnostic,
} from './engine-diagnostics.mts';
import { hasCheckPlugins } from './skip/runner-checks.mts';
import { keptRows, mayReportOf, rowsOf } from './skip/plan-rows.mts';
import {
  checksOff,
  plannedArguments,
  planLine,
  remainingChecks,
  sourceSetPlan,
} from './skip/source-set-plan.mts';

export type ErrorProneEnginePlan = {
  readonly reportDir: string;
  readonly argumentFiles: readonly string[];
  readonly javaHome: string;
};
type Setting = EngineCall & {
  readonly javaHome: string;
  readonly log?: { write(text: string): unknown } | undefined;
};
type Selected = EngineChecks &
  ArgumentSet & { readonly file: string; readonly remaining: readonly string[] };

const ERROR_PRONE_RULES = '_ErrorProne';

export function errorPronePlanOf(plan: unknown): ErrorProneEnginePlan {
  return {
    reportDir: String(fieldOf(plan, 'reportDir')),
    argumentFiles: textsOf(fieldOf(plan, 'argumentFiles')),
    javaHome: String(fieldOf(plan, 'javaHome')),
  };
}

export function javaHomeOf(java: string): string {
  return path.isAbsolute(java) && existsSync(java)
    ? path.dirname(path.dirname(realpathSync(java)))
    : '';
}

function engineReport(
  { file, head, sources, checks, packages, remaining }: Selected,
  { binary, javaHome, environment, run }: Setting,
): unknown {
  const listed = `${file}.engine-sources.txt`;
  const lookup = `${file}.engine-classpath.txt`;
  const report = `${file}.engine-report.json`;
  writeFileSync(listed, sources.map((source) => `${source}\n`).join(''));
  writeFileSync(lookup, lookupEntries(head).join('\n'));
  rmSync(report, { force: true });
  const release = releaseOf(head);
  const { status, stderr } = run(
    [
      ...['--files', listed, '--rules', ERROR_PRONE_RULES, '--classpath', lookup],
      ...(release === undefined ? [] : ['--release', release]),
      ...['--out', report],
    ],
    {
      binary,
      environment: {
        ...environment,
        NP_EP_ONLY: checks.join(','),
        NP_EP_MAY_REPORT: remaining.join(','),
        ...(checks.includes(NULL_AWAY) ? { NP_NULLAWAY_PACKAGES: packages.join(',') } : {}),
        NITPICKER_JDK: javaHome,
      },
    },
  );
  if (status !== 0) {
    throw new Error(stderr.trim());
  }
  return parseJson(readFileSync(report, 'utf8'));
}

function diagnosticsOf(file: string, setting: Setting): EngineDiagnostic[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  const set = argumentSetOf(text);
  const name = path.basename(file, '.args');
  const whole =
    wholeReason(set.head) ??
    (hasCheckPlugins(set.head) ? 'its processor path brings checks' : undefined);
  if (whole !== undefined || set.sources.length === 0) {
    if (whole !== undefined) {
      setting.log?.write(`nitpicker: Error Prone compiles ${name} whole: ${whole}\n`);
    }
    return [];
  }
  const selected = engineChecksFor(set.head);
  const remaining = remainingChecks(set, selected.checks);
  const report = engineReport({ file, ...set, ...selected, remaining }, setting);
  const unparsed = textsOf(fieldOf(report, 'syntaxErrorFiles'));
  if (unparsed.length > 0) {
    throw new Error(`it could not read ${unparsed[0] ?? ''}`);
  }
  const plan = sourceSetPlan(set, remaining, mayReportOf(report));
  const rows = keptRows(
    rowsOf(report, selected.checks, generatedRoots(set.head)),
    set,
    plan.kind === 'narrowed' ? plan.files : [],
  );
  const diagnostics = engineDiagnostics(rows);
  writeFileSync(
    file,
    plannedArguments(
      set,
      plan,
      checksOff(plan, remaining, selected.checks).map((check) => `-Xep:${check}:OFF`),
    ),
  );
  setting.log?.write(planLine(name, set, plan));
  return diagnostics;
}

export function errorProneOnEngine(
  plan: ErrorProneEnginePlan,
  environment: Environment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): void {
  const reportFile = path.join(plan.reportDir, ENGINE_REPORT);
  rmSync(reportFile, { force: true });
  const binary = findEngine(environment);
  if (binary === undefined || !existsSync(path.join(plan.javaHome, 'jmods'))) {
    return;
  }
  const setting = { binary, javaHome: plan.javaHome, environment, run, log };
  const diagnostics = plan.argumentFiles.flatMap((file) => {
    try {
      return diagnosticsOf(file, setting);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log?.write(
        `nitpicker: the engine did not run its Error Prone checks, Error Prone runs them: ${reason}\n`,
      );
      return [];
    }
  });
  writeFileSync(reportFile, JSON.stringify(diagnostics));
}

/** The arguments files that still list sources for Error Prone after the engine step. */
export function argumentFilesToCompile(argumentFiles: readonly string[]): string[] {
  return argumentFiles.filter(
    (file) => argumentSetOf(readFileSync(file, 'utf8')).sources.length > 0,
  );
}
