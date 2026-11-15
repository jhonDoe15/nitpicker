import {
  blockAt as untypedBlockAt,
  blockStartingIn as untypedBlockStartingIn,
  comparePositions as untypedComparePositions,
  parseCoverProfile as untypedParseCoverProfile,
} from '../branch-coverage/coverage-profile.mjs';
import {
  directoryOf as untypedDirectoryOf,
  goPackages as untypedGoPackages,
} from '../facts/go-packages.mjs';
import {
  moduleFileText as untypedModuleFileText,
  readGoModule as untypedReadGoModule,
} from '../execution/go-module.mjs';
import { execute as untypedExecute } from '../execution/go-process.mjs';
import {
  buildFlags as untypedBuildFlags,
  readVetFindings as untypedReadVetFindings,
} from '../build/go-vet.mjs';
import {
  inspectBaseline as untypedInspectBaseline,
  readInspect as untypedReadInspect,
} from '../structure/go-inspect.mjs';
import {
  readTestRun as untypedReadTestRun,
  testRunFindings as untypedTestRunFindings,
} from '../tests/go-test.mjs';
import { parseTestEvents as untypedParseTestEvents } from '../tests/test-events.mjs';
import { readRaceCheck as untypedReadRaceCheck } from '../race/race-run.mjs';
import {
  parseRaces as untypedParseRaces,
  raceFindings as untypedRaceFindings,
  raceNotCheckedFinding as untypedRaceNotCheckedFinding,
  raceOnlyFailureFinding as untypedRaceOnlyFailureFinding,
} from '../race/race-reports.mjs';
import type {
  CoverBlock,
  CoverProfile,
  FindingRow,
  GoPackages,
  InspectReport,
  Position,
  TestRun,
} from '../go-types.mts';

export type RaceCheck = {
  readonly checked: boolean;
  readonly reason?: string;
  readonly raceOnly?: readonly { readonly id: string; readonly package: string }[];
};
type ProcessResult = { stdout?: string; stderr?: string; error?: Error };
type RaceAccess = readonly { readonly [field: string]: unknown }[];

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
const execute: (
  context: object,
  command: readonly string[],
  options?: { timeout?: number },
) => ProcessResult = untypedExecute;
const buildFlags: (settings: object) => string[] = untypedBuildFlags;
const readVetFindings: (context: object) => FindingRow[] = untypedReadVetFindings;
const readInspect: (reportRoot: string) => InspectReport = untypedReadInspect;
const inspectBaseline: (context: object) => InspectReport | undefined = untypedInspectBaseline;
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
) => RaceAccess[] = untypedParseRaces;
const raceFindings: (reports: readonly { accesses: RaceAccess; test: string }[]) => FindingRow[] =
  untypedRaceFindings;
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
