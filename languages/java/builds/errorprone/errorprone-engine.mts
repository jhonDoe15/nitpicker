import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import { engineFindingOf } from '../../../../shared/engine/engine-rows.mts';
import {
  runEngineSync,
  type EngineEnvironment as Environment,
  type EngineStart,
} from '../../../../shared/engine/engine-run.mts';
import { fieldOf, listOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import {
  argumentSetOf,
  generatedRoots,
  lookupEntries,
  releaseOf,
  withProjectFlags,
  type ArgumentSet,
} from './engine-arguments.mts';
import { engineChecksFor, NULL_AWAY, type EngineChecks } from './engine-checks.mts';
import { diagnosticOf, ENGINE_REPORT, type EngineDiagnostic } from './engine-diagnostics.mts';

export type ErrorProneEnginePlan = {
  readonly reportDir: string;
  readonly argumentFiles: readonly string[];
  readonly javaHome: string;
};
type Setting = {
  readonly binary: string;
  readonly javaHome: string;
  readonly environment: Environment;
  readonly run: EngineStart;
};
type Selected = EngineChecks & ArgumentSet & { readonly file: string };
type Log = { write(text: string): unknown };
export type EngineOptions = { readonly run?: EngineStart; readonly log?: Log };

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
  { file, head, sources, checks, packages }: Selected,
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
  const text = readFileSync(file, 'utf8');
  const set = argumentSetOf(text);
  const selected = engineChecksFor(set.head);
  if (selected.checks.length === 0 || set.sources.length === 0) {
    return [];
  }
  const report = engineReport({ file, ...set, ...selected }, setting);
  const unparsed = textsOf(fieldOf(report, 'syntaxErrorFiles'));
  if (unparsed.length > 0) {
    throw new Error(`it could not read ${unparsed[0] ?? ''}`);
  }
  const skipped = generatedRoots(set.head).map((root) => `${root.split(path.sep).join('/')}/`);
  const rows = listOf(fieldOf(report, 'findings'))
    .map(engineFindingOf)
    .filter(({ rule }) => selected.checks.includes(rule))
    .filter(({ file: source }) => {
      const slashed = source.split(path.sep).join('/');
      return !skipped.some((root) => slashed.includes(root));
    });
  const diagnostics = rows.map(diagnosticOf);
  writeFileSync(
    file,
    withProjectFlags(
      text,
      selected.checks.map((check) => `-Xep:${check}:OFF`),
    ),
  );
  return diagnostics;
}

export function errorProneOnEngine(
  plan: ErrorProneEnginePlan,
  environment: Environment,
  {
    run = (argumentList, options) => runEngineSync(argumentList, options),
    log,
  }: EngineOptions = {},
): void {
  const reportFile = path.join(plan.reportDir, ENGINE_REPORT);
  rmSync(reportFile, { force: true });
  const binary = findEngine(environment);
  if (binary === undefined || !existsSync(path.join(plan.javaHome, 'jmods'))) {
    return;
  }
  const setting = { binary, javaHome: plan.javaHome, environment, run };
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
