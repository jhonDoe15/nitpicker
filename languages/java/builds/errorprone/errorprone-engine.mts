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
  encodingOf,
  generatedRoots,
  lookupEntries,
  modulePathEntries,
  releaseOf,
  sourceLevelOf,
  type ArgumentSet,
} from './engine-arguments.mts';
import {
  engineChecksFor,
  NULL_AWAY,
  sourceSetLevels,
  testOnly,
  wholeReason,
  type EngineChecks,
} from './engine-checks.mts';
import {
  diagnosticsOf as engineDiagnostics,
  ENGINE_REPORT,
  type EngineDiagnostic,
} from './engine-diagnostics.mts';
import type { CheckLevels } from './options/check-levels.mts';
import { narrowedFlags } from './options/narrowed-flags.mts';
import { excludedFile, handedBack } from './options/project-options.mts';
import { lombokOff } from './options/runner-levels.mts';
import { engineHandedBack, keptRows, mayReportOf, rowsOf } from './skip/plan-rows.mts';
import {
  auditEnvironment,
  contextFiles,
  contextRoots,
  rewrittenOf,
} from './processors/processor-sources.mts';
import {
  plannedArguments,
  planLine,
  remainingChecks,
  sourceSetPlan,
  type SourceSetPlan,
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

type Inputs = {
  readonly listed: string;
  readonly lookup: string;
  readonly modules: string;
  readonly modulePath: readonly string[];
};

function writeInputs(file: string, head: readonly string[], sources: readonly string[]): Inputs {
  const listed = `${file}.engine-sources.txt`;
  const lookup = `${file}.engine-classpath.txt`;
  const modules = `${file}.engine-modulepath.txt`;
  const read = [...sources, ...contextFiles(head, sources)];
  writeFileSync(listed, read.map((source) => `${source}\n`).join(''));
  writeFileSync(lookup, lookupEntries(head).join('\n'));
  const modulePath = modulePathEntries(head);
  writeFileSync(modules, modulePath.join('\n'));
  return { listed, lookup, modules, modulePath };
}

function levelArguments(head: readonly string[]): string[] {
  const release = releaseOf(head);
  if (release !== undefined) {
    return ['--release', release];
  }
  const source = sourceLevelOf(head);
  return source === undefined ? [] : ['--source', source];
}

function engineReport(
  { file, head, sources, checks, packages, remaining }: Selected,
  { binary, javaHome, environment, run }: Setting,
): unknown {
  const { listed, lookup, modules, modulePath } = writeInputs(file, head, sources);
  const report = `${file}.engine-report.json`;
  rmSync(report, { force: true });
  const encoding = encodingOf(head);
  const { status, stderr } = run(
    [
      ...['--files', listed, '--rules', ERROR_PRONE_RULES, '--classpath', lookup],
      ...(modulePath.length === 0 ? [] : ['--module-path', modules]),
      ...levelArguments(head),
      ...(testOnly(head) ? ['--test-only'] : []),
      ...(encoding === undefined ? [] : ['--encoding', encoding]),
      ...['--out', report],
    ],
    {
      binary,
      environment: {
        ...environment,
        NP_EP_ONLY: checks.join(','),
        NP_EP_MAY_REPORT: remaining.join(','),
        ...(checks.includes(NULL_AWAY) ? { NP_NULLAWAY_PACKAGES: packages.join(',') } : {}),
        ...auditEnvironment(head, sources),
        NITPICKER_JDK: javaHome,
      },
    },
  );
  if (status !== 0) {
    throw new Error(stderr.trim());
  }
  return parseJson(readFileSync(report, 'utf8'));
}

type Planned = {
  readonly set: ArgumentSet;
  readonly plan: SourceSetPlan;
  readonly levels: CheckLevels;
};

function writePlan(file: string, { set, plan, levels }: Planned): void {
  const flags = plan.kind === 'narrowed' ? narrowedFlags(set.head, plan.checks, levels) : [];
  writeFileSync(file, plannedArguments(set, plan, flags));
}

function everyFileRead(report: unknown): unknown {
  const unparsed = textsOf(fieldOf(report, 'syntaxErrorFiles'));
  if (unparsed.length > 0) {
    throw new Error(`it could not read ${unparsed[0] ?? ''}`);
  }
  return report;
}

type EngineSet = {
  readonly set: ArgumentSet;
  readonly name: string;
  readonly levels: CheckLevels;
};

function engineSetOf(file: string, setting: Setting): EngineSet | undefined {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  const set = argumentSetOf(text);
  const name = path.basename(file, '.args');
  const levels = sourceSetLevels(set);
  const whole = wholeReason(set, levels);
  if (whole !== undefined) {
    setting.log?.write(`nitpicker: Error Prone compiles ${name} whole: ${whole}\n`);
  }
  return whole !== undefined || levels === undefined || set.sources.length === 0
    ? undefined
    : { set, name, levels };
}

function unreportedRoots(set: ArgumentSet): string[] {
  return [...generatedRoots(set.head), ...contextRoots(set.head, set.sources)];
}

function changedClass(report: unknown, name: string, setting: Setting): boolean {
  const [rewritten] = rewrittenOf(report);
  if (rewritten !== undefined) {
    setting.log?.write(
      `nitpicker: Error Prone compiles ${name} whole: a class file does not match its source (${rewritten})\n`,
    );
  }
  return rewritten !== undefined;
}

function diagnosticsOf(file: string, setting: Setting): EngineDiagnostic[] {
  const engineSet = engineSetOf(file, setting);
  if (engineSet === undefined) {
    return [];
  }
  const { set, name, levels } = engineSet;
  const selected = engineChecksFor(set, levels);
  const remaining = remainingChecks(set, selected.checks, levels);
  const report = everyFileRead(engineReport({ file, ...set, ...selected, remaining }, setting));
  if (changedClass(report, name, setting)) {
    return [];
  }
  const found = rowsOf(report, selected.checks, unreportedRoots(set));
  const plan = sourceSetPlan(set, remaining, {
    mayReport: mayReportOf(report),
    handedBack: engineHandedBack(report, set, found, handedBack(set, found, levels)),
  });
  const rows = keptRows(found, {
    set,
    plan,
    lombokOff: lombokOff(set.head, true),
    excluded: excludedFile(set.head),
  });
  writePlan(file, { set, plan, levels });
  setting.log?.write(planLine(name, set, plan));
  return engineDiagnostics(rows);
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
