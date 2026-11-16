import {
  blockAt as untypedBlockAt,
  blockStartingIn as untypedBlockStartingIn,
  comparePositions as untypedComparePositions,
  parseCoverProfile as untypedParseCoverProfile,
} from '../branch-coverage/coverage-profile.mts';
import {
  directoryOf as untypedDirectoryOf,
  goPackages as untypedGoPackages,
} from '../facts/go-packages.mts';
import {
  moduleFileText as untypedModuleFileText,
  readGoModule as untypedReadGoModule,
} from '../execution/go-module.mts';
import { execute as untypedExecute } from '../execution/go-process.mts';
import {
  buildFlags as untypedBuildFlags,
  readVetFindings as untypedReadVetFindings,
} from '../build/go-vet.mts';
import {
  inspectBaseline as untypedInspectBaseline,
  readInspect as untypedReadInspect,
} from '../structure/go-inspect.mts';
import {
  readTestRun as untypedReadTestRun,
  testRunFindings as untypedTestRunFindings,
} from '../tests/go-test.mts';
import { parseTestEvents as untypedParseTestEvents } from '../tests/test-events.mts';
import { readRaceCheck as untypedReadRaceCheck } from '../race/race-run.mts';
import {
  parseRaces as untypedParseRaces,
  raceFindings as untypedRaceFindings,
  raceNotCheckedFinding as untypedRaceNotCheckedFinding,
  raceOnlyFailureFinding as untypedRaceOnlyFailureFinding,
} from '../race/race-reports.mts';
import { callUntyped as call } from '../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf, listOf, textsOf } from '../../../../shared/values/readers.mts';
import { isRow } from './row-readers.mts';
import type {
  CoverBlock,
  CoverProfile,
  FindingRow,
  GoPackages,
  InspectReport,
  Position,
  ProcessResult,
  RaceAccess,
  RaceCheck,
  RaceReport,
  TestRun,
} from '../go-types.mts';

export type { RaceCheck };

const comparePositions: (left: Position, right: Position) => number = untypedComparePositions;
const parseCoverProfile: (text: string, modulePath: string | undefined) => CoverProfile =
  untypedParseCoverProfile;
const blockAt: (blocks: readonly CoverBlock[], position: Position) => CoverBlock | undefined =
  untypedBlockAt;
const blockStartingIn: (
  blocks: readonly CoverBlock[],
  from: Position,
  to: Position,
) => CoverBlock | undefined = untypedBlockStartingIn;
const directoryOf: (file: string) => string = untypedDirectoryOf;
const goPackages: (report: Pick<InspectReport, 'files'>, module?: string) => GoPackages =
  untypedGoPackages;
const readGoModule: (projectRoot: string) => { module: string | undefined } | undefined =
  untypedReadGoModule;
const moduleFileText: (root: string | undefined, file: string) => string | undefined =
  untypedModuleFileText;
function processResultOf(value: unknown): ProcessResult {
  const stdout = fieldOf(value, 'stdout');
  const stderr = fieldOf(value, 'stderr');
  const status = fieldOf(value, 'status');
  const error = fieldOf(value, 'error');
  return {
    ...(typeof stdout === 'string' ? { stdout } : {}),
    ...(typeof stderr === 'string' ? { stderr } : {}),
    ...(typeof status === 'number' || status === null ? { status } : {}),
    ...(error instanceof Error ? { error } : {}),
  };
}

function execute(
  context: object,
  command: readonly string[],
  options?: { timeout?: number },
): ProcessResult {
  return processResultOf(call(untypedExecute, context, command, options));
}

function buildFlags(settings: object): string[] {
  return textsOf(call(untypedBuildFlags, settings));
}

function readVetFindings(context: object): FindingRow[] {
  return listOf(call(untypedReadVetFindings, context)).filter(isRow);
}

function isInspectReport(value: unknown): value is InspectReport {
  return Array.isArray(fieldOf(value, 'files'));
}
const readInspect: (reportRoot: string) => InspectReport = untypedReadInspect;
function inspectBaseline(context: object): InspectReport | undefined {
  const report = call(untypedInspectBaseline, context);
  return isInspectReport(report) ? report : undefined;
}
const readTestRun: (reportRoot: string) => TestRun = untypedReadTestRun;
const testRunFindings: (
  run: Pick<TestRun, 'failures' | 'testsRan' | 'buildFailures'>,
  snapshot?: string,
) => FindingRow[] = untypedTestRunFindings;
const parseTestEvents: (text: string) => TestRun = untypedParseTestEvents;
const readRaceCheck: (reportRoot: string) => RaceCheck = untypedReadRaceCheck;
const parseRaces: (
  text: string,
  module: { root: string; path: string | undefined },
) => RaceAccess[][] = untypedParseRaces;
const raceFindings: (reports: readonly RaceReport[]) => FindingRow[] = untypedRaceFindings;
const raceNotCheckedFinding: (reason: string | undefined) => FindingRow =
  untypedRaceNotCheckedFinding;
const raceOnlyFailureFinding: (packageName: string, tests: readonly string[]) => FindingRow =
  untypedRaceOnlyFailureFinding;

export {
  blockAt,
  blockStartingIn,
  buildFlags,
  comparePositions,
  directoryOf,
  execute,
  goPackages,
  inspectBaseline,
  moduleFileText,
  parseCoverProfile,
  parseRaces,
  parseTestEvents,
  raceFindings,
  raceNotCheckedFinding,
  raceOnlyFailureFinding,
  readGoModule,
  readInspect,
  readRaceCheck,
  readTestRun,
  readVetFindings,
  testRunFindings,
};
