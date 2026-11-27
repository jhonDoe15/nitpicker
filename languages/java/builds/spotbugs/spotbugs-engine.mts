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
import { INVOCATION_PATTERNS, URL_PATTERNS } from './spotbugs-dumb-placed.mts';
import {
  CAST_PATTERNS,
  ENUM_PATTERNS,
  START_PATTERNS,
  WAIT_PATTERNS,
} from './spotbugs-tail-placed.mts';
import { engineSpotbugsFindingOf, spotbugsResultOf } from './spotbugs-results.mts';
import {
  type ProcessorKind,
  lombokMarksGenerated,
  processorKind,
  withoutLombokWrites,
} from './spotbugs-lombok.mts';
import { lombokVersionOf, marksGeneratedByDefault } from './spotbugs-lombok-version.mts';
import {
  DEAD_STORES,
  LOCK_MONITORENTER,
  ON_ENGINE,
  SELF_ASSIGNMENTS,
  SEQUENCE_ON_CONCURRENT,
  SHARED_WRITES,
  UNSYNC_GET,
  UTIL_MONITORENTER,
  WRONG_MAP_ITERATOR,
} from './spotbugs-patterns.mts';

export { ON_ENGINE } from './spotbugs-patterns.mts';

export type SpotbugsEnginePlan = {
  readonly reportDir: string;
  readonly sources: readonly string[];
  readonly classpath: readonly string[];
  readonly classes?: readonly string[];
  readonly processorPath: readonly string[];
  readonly processors?: ProcessorKind;
  readonly lombokVersion?: string;
  readonly javaHome: string;
};

export const SPOTBUGS_ENGINE_SARIF = 'spotbugs-engine.sarif';
export const SPOTBUGS_ENGINE_ARGUMENTS = 'spotbugs-engine-arguments.txt';
const EXCLUDE_FILE = 'spotbugs-engine-exclude.xml';
const SOURCES_FILE = 'spotbugs-engine-sources.txt';
const CLASSPATH_FILE = 'spotbugs-engine-classpath.txt';
const CLASSES_FILE = 'spotbugs-engine-classes.txt';
const REPORT_FILE = 'spotbugs-engine-report.json';
const DETECTORS: Readonly<Record<string, readonly string[]>> = {
  MultipleInstantiationsOfSingletons: [
    'SING_SINGLETON_GETTER_NOT_SYNCHRONIZED',
    'SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR',
    'SING_SINGLETON_IMPLEMENTS_CLONEABLE',
    'SING_SINGLETON_IMPLEMENTS_CLONE_METHOD',
    'SING_SINGLETON_IMPLEMENTS_SERIALIZABLE',
    'SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE',
  ],
  CloneIdiom: ['CN_IDIOM', 'CN_IDIOM_NO_SUPER_CALL', 'CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE'],
  ConstructorThrow: ['CT_CONSTRUCTOR_THROW'],
  FindHiddenMethod: ['HSM_HIDING_METHOD'],
  FindNakedNotify: ['NN_NAKED_NOTIFY'],
  SharedVariableAtomicityDetector: SHARED_WRITES,
  AtomicityProblem: [SEQUENCE_ON_CONCURRENT],
  FindUnsyncGet: [UNSYNC_GET],
  ConfusionBetweenInheritedAndOuterMethod: ['IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD'],
  IteratorIdioms: ['IT_NO_SUCH_ELEMENT'],
  DefaultEncodingDetector: ['DM_DEFAULT_ENCODING'],
  FindUselessControlFlow: ['UCF_USELESS_CONTROL_FLOW', 'UCF_USELESS_CONTROL_FLOW_NEXT_LINE'],
  URLProblems: URL_PATTERNS,
  DumbMethodInvocations: INVOCATION_PATTERNS,
  IDivResultCastToDouble: CAST_PATTERNS,
  WaitInLoop: WAIT_PATTERNS,
  StartInConstructor: START_PATTERNS,
  MutableEnum: ENUM_PATTERNS,
  DontCatchNullPointerException: ['DCN_NULLPOINTER_EXCEPTION'],
  WrongMapIterator: [WRONG_MAP_ITERATOR],
  BooleanReturnNull: ['NP_BOOLEAN_RETURN_NULL'],
  FindDeadLocalStores: DEAD_STORES,
  FindLocalSelfAssignment2: SELF_ASSIGNMENTS,
  FindJSR166LockMonitorenter: [
    LOCK_MONITORENTER,
    UTIL_MONITORENTER,
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
    classes: textsOf(fieldOf(plan, 'classes')),
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
  lombok: boolean,
  { binary, environment, run }: EngineCall,
): unknown {
  const sources = writtenFile(
    path.join(plan.reportDir, SOURCES_FILE),
    plan.sources.map((file) => `${file}\n`).join(''),
  );
  const lookup = writtenFile(path.join(plan.reportDir, CLASSPATH_FILE), plan.classpath.join('\n'));
  const classes = plan.classes ?? [];
  const compiled =
    lombok && classes.length > 0
      ? ['--classes', writtenFile(path.join(plan.reportDir, CLASSES_FILE), classes.join('\n'))]
      : [];
  const report = path.join(plan.reportDir, REPORT_FILE);
  rmSync(report, { force: true });
  const { status, stderr } = run(
    [
      '--files',
      sources,
      '--rules',
      '_SpotBugs',
      '--classpath',
      lookup,
      ...(lombok ? ['--lombok'] : []),
      ...compiled,
      '--out',
      report,
    ],
    {
      binary,
      environment: {
        ...environment,
        NP_SB_ONLY: ON_ENGINE.join(','),
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

function marked(plan: SpotbugsEnginePlan): boolean {
  const version = plan.lombokVersion ?? lombokVersionOf(plan.processorPath);
  return lombokMarksGenerated(plan.sources, marksGeneratedByDefault(version));
}

function processorsOn(plan: SpotbugsEnginePlan): ProcessorKind {
  const processors = plan.processors ?? processorKind(plan.processorPath);
  return processors === 'lombok' && !marked(plan) ? 'other' : processors;
}

export function withoutSpotbugsEngineReport(reportDir: string): void {
  for (const name of [SPOTBUGS_ENGINE_SARIF, EXCLUDE_FILE, SPOTBUGS_ENGINE_ARGUMENTS]) {
    rmSync(path.join(reportDir, name), { force: true });
  }
}

function enginePatterns(plan: SpotbugsEnginePlan, lombok: boolean): readonly string[] {
  return lombok ? withoutLombokWrites(ON_ENGINE, (plan.classes ?? []).length > 0) : ON_ENGINE;
}

export function spotbugsOnEngine(
  plan: SpotbugsEnginePlan,
  environment: Environment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): string[] {
  withoutSpotbugsEngineReport(plan.reportDir);
  const binary = findEngine(environment);
  const processors = processorsOn(plan);
  if (!usable(plan, binary) || processors === 'other') {
    return [];
  }
  const lombok = processors === 'lombok';
  const patterns = enginePatterns(plan, lombok);
  try {
    const report = engineReport(plan, lombok, { binary, environment, run });
    writeFileSync(path.join(plan.reportDir, SPOTBUGS_ENGINE_SARIF), engineSarif(report, patterns));
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
