import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  writtenFile,
  type EngineCall,
  type EngineEnvironment as Environment,
  type EngineHooks,
} from '../../../../shared/engine/engine-run.mts';
import { fieldOf, listOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { engineSpotbugsFindingOf, spotbugsResultOf } from './spotbugs-results.mts';
import { lombokMarksGenerated, processorKind } from './spotbugs-lombok.mts';

export type SpotbugsEnginePlan = {
  readonly reportDir: string;
  readonly sources: readonly string[];
  readonly classpath: readonly string[];
  readonly processorPath: readonly string[];
  readonly javaHome: string;
};

export const SPOTBUGS_ENGINE_SARIF = 'spotbugs-engine.sarif';
export const SPOTBUGS_ENGINE_ARGUMENTS = 'spotbugs-engine-arguments.txt';
const EXCLUDE_FILE = 'spotbugs-engine-exclude.xml';
const SOURCES_FILE = 'spotbugs-engine-sources.txt';
const CLASSPATH_FILE = 'spotbugs-engine-classpath.txt';
const REPORT_FILE = 'spotbugs-engine-report.json';
const SPOTBUGS_RULES = '_SpotBugs';
const ON_ENGINE: readonly string[] = [
  'CT_CONSTRUCTOR_THROW',
  'EI_EXPOSE_REP',
  'MS_EXPOSE_REP',
  'EI_EXPOSE_REP2',
  'EI_EXPOSE_STATIC_REP2',
  'DCN_NULLPOINTER_EXCEPTION',
  'JLM_JSR166_LOCK_MONITORENTER',
  'JLM_JSR166_UTILCONCURRENT_MONITORENTER',
  'PREDICTABLE_RANDOM',
  'VO_VOLATILE_INCREMENT',
  'WMI_WRONG_MAP_ITERATOR',
  'SF_SWITCH_FALLTHROUGH',
  'SF_SWITCH_NO_DEFAULT',
];
const NEEDS_LOMBOK_MEMBERS: readonly string[] = [
  'JLM_JSR166_LOCK_MONITORENTER',
  'JLM_JSR166_UTILCONCURRENT_MONITORENTER',
  'WMI_WRONG_MAP_ITERATOR',
];
const DETECTORS: Readonly<Record<string, readonly string[]>> = {
  ConstructorThrow: ['CT_CONSTRUCTOR_THROW'],
  DontCatchNullPointerException: ['DCN_NULLPOINTER_EXCEPTION'],
  WrongMapIterator: ['WMI_WRONG_MAP_ITERATOR'],
  FindJSR166LockMonitorenter: [
    'JLM_JSR166_LOCK_MONITORENTER',
    'JLM_JSR166_UTILCONCURRENT_MONITORENTER',
    'JML_JSR166_CALLING_WAIT_RATHER_THAN_AWAIT',
  ],
  VolatileUsage: ['VO_VOLATILE_INCREMENT', 'VO_VOLATILE_REFERENCE_TO_ARRAY'],
  SwitchFallthrough: [
    'SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH',
    'SF_DEAD_STORE_DUE_TO_SWITCH_FALLTHROUGH_TO_THROW',
    'SF_SWITCH_FALLTHROUGH',
    'SF_SWITCH_NO_DEFAULT',
  ],
  FindReturnRef: [
    'EI_EXPOSE_REP',
    'MS_EXPOSE_REP',
    'EI_EXPOSE_REP2',
    'EI_EXPOSE_STATIC_REP2',
    'EI_EXPOSE_BUF',
    'EI_EXPOSE_BUF2',
    'EI_EXPOSE_STATIC_BUF2',
    'MS_EXPOSE_BUF',
  ],
};

export function spotbugsPlanOf(plan: unknown): SpotbugsEnginePlan {
  return {
    reportDir: String(fieldOf(plan, 'reportDir')),
    sources: textsOf(fieldOf(plan, 'sources')),
    classpath: textsOf(fieldOf(plan, 'classpath')),
    processorPath: textsOf(fieldOf(plan, 'processorPath')),
    javaHome: String(fieldOf(plan, 'javaHome')),
  };
}

function omittedDetectors(patterns: readonly string[]): string[] {
  return Object.entries(DETECTORS)
    .filter(([, reported]) => reported.every((pattern) => patterns.includes(pattern)))
    .map(([detector]) => detector);
}

function excludedPatterns(patterns: readonly string[]): string[] {
  const omitted = new Set(
    omittedDetectors(patterns).flatMap((detector) => DETECTORS[detector] ?? []),
  );
  return patterns.filter((pattern) => !omitted.has(pattern));
}

function excludeFilter(patterns: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<FindBugsFilter>',
    '  <Match>',
    `    <Bug pattern="${patterns.join(',')}"/>`,
    '  </Match>',
    '</FindBugsFilter>',
    '',
  ].join('\n');
}

export function spotbugsArgumentsFor(reportDir: string, patterns: readonly string[]): string[] {
  const omitted = omittedDetectors(patterns);
  const excluded = excludedPatterns(patterns);
  return [
    ...(omitted.length === 0 ? [] : ['-omitVisitors', omitted.join(',')]),
    ...(excluded.length === 0
      ? []
      : ['-exclude', writtenFile(path.join(reportDir, EXCLUDE_FILE), excludeFilter(excluded))]),
  ];
}

function engineReport(
  plan: SpotbugsEnginePlan,
  patterns: readonly string[],
  { binary, environment, run }: EngineCall,
): unknown {
  const sources = writtenFile(
    path.join(plan.reportDir, SOURCES_FILE),
    plan.sources.map((file) => `${file}\n`).join(''),
  );
  const lookup = writtenFile(path.join(plan.reportDir, CLASSPATH_FILE), plan.classpath.join('\n'));
  const report = path.join(plan.reportDir, REPORT_FILE);
  rmSync(report, { force: true });
  const { status, stderr } = run(
    ['--files', sources, '--rules', SPOTBUGS_RULES, '--classpath', lookup, '--out', report],
    {
      binary,
      environment: {
        ...environment,
        NP_SB_ONLY: patterns.join(','),
        NITPICKER_JDK: plan.javaHome,
      },
    },
  );
  if (status !== 0) {
    throw new Error(stderr.trim());
  }
  const parsed = parseJson(readFileSync(report, 'utf8'));
  const unparsed = textsOf(fieldOf(parsed, 'syntaxErrorFiles'));
  if (unparsed.length > 0) {
    throw new Error(`it could not read ${unparsed[0] ?? ''}`);
  }
  return parsed;
}

function engineSarif(report: unknown, patterns: readonly string[]): string {
  const results = listOf(fieldOf(report, 'findings'))
    .map(engineSpotbugsFindingOf)
    .filter(({ rule }) => patterns.includes(rule))
    .map(spotbugsResultOf);
  return JSON.stringify({
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'SpotBugs', rules: [] } }, results }],
  });
}

function usable(plan: SpotbugsEnginePlan, binary: string | undefined): binary is string {
  return (
    binary !== undefined && plan.sources.length > 0 && existsSync(path.join(plan.javaHome, 'jmods'))
  );
}

function enginePatterns(plan: SpotbugsEnginePlan): readonly string[] {
  const processors = processorKind(plan.processorPath);
  if (processors === 'none') {
    return ON_ENGINE;
  }
  if (processors === 'lombok' && lombokMarksGenerated(plan.sources)) {
    return ON_ENGINE.filter((pattern) => !NEEDS_LOMBOK_MEMBERS.includes(pattern));
  }
  return [];
}

export function withoutSpotbugsEngineReport(reportDir: string): void {
  for (const name of [SPOTBUGS_ENGINE_SARIF, EXCLUDE_FILE, SPOTBUGS_ENGINE_ARGUMENTS]) {
    rmSync(path.join(reportDir, name), { force: true });
  }
}

export function spotbugsOnEngine(
  plan: SpotbugsEnginePlan,
  environment: Environment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): string[] {
  withoutSpotbugsEngineReport(plan.reportDir);
  const binary = findEngine(environment);
  const patterns = enginePatterns(plan);
  if (!usable(plan, binary) || patterns.length === 0) {
    return [];
  }
  try {
    const sarif = engineSarif(engineReport(plan, patterns, { binary, environment, run }), patterns);
    writeFileSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF), sarif);
    return spotbugsArgumentsFor(plan.reportDir, patterns);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log?.write(
      `nitpicker: the engine did not run its SpotBugs patterns, SpotBugs runs them: ${reason}\n`,
    );
    withoutSpotbugsEngineReport(plan.reportDir);
    return [];
  }
}
