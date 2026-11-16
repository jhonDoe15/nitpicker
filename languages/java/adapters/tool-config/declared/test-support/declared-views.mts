import {
  declaredConfigFiles as untypedDeclaredConfigFiles,
  declaredToolChoices as untypedDeclaredToolChoices,
  declaredToolDigest as untypedDeclaredToolDigest,
  declaredToolNotices as untypedDeclaredToolNotices,
} from '../declared-choices.mjs';
import {
  directorySource as untypedDirectorySource,
  readDeclaredBuild as untypedReadDeclaredBuild,
} from '../declared-build.mjs';
import {
  ERRORPRONE as untypedErrorprone,
  errorproneDeclarations as untypedErrorproneDeclarations,
  errorproneLayers as untypedErrorproneLayers,
} from '../errorprone-declared.mjs';
import {
  PIT as untypedPit,
  pitArguments as untypedPitArguments,
  pitDeclarations as untypedPitDeclarations,
  pitLayers as untypedPitLayers,
} from '../pit-declared.mjs';
import {
  spotbugsArguments as untypedSpotbugsArguments,
  spotbugsDeclarations as untypedSpotbugsDeclarations,
  spotbugsLayers as untypedSpotbugsLayers,
} from '../spotbugs-declared.mjs';
import {
  TESTS as untypedTests,
  testRetryDeclarations as untypedTestRetryDeclarations,
  testRetryValues as untypedTestRetryValues,
} from '../test-retries-declared.mjs';

export type Declaration = {
  readonly setting: string;
  readonly value?: unknown;
  readonly path?: string | undefined;
  readonly file: string;
  readonly conditional?: unknown;
};

export type BuildSource = {
  readonly paths: () => string[];
  readonly readMany: (files: readonly string[]) => Map<string, string | undefined>;
};

type Layers = Readonly<Record<string, unknown>>;
type Choice = { readonly arguments: unknown; readonly files: unknown };
type Tool = {
  readonly declarations: (build: unknown) => Declaration[];
  readonly notice: (declarations: readonly Declaration[], layers: Layers) => string[];
  readonly choice: (build: unknown, options: { readonly layers: Layers }) => Choice;
};
type SettingLayers = {
  readonly notApplied: readonly Declaration[];
  readonly flags: string[];
};
type PitLayers = {
  readonly threads: unknown;
  readonly timeoutConst: unknown;
  readonly timeoutFactor: unknown;
  readonly mutators: string[];
  readonly lists: Readonly<Record<string, string[] | undefined>>;
  readonly notApplied: readonly Declaration[];
};
type SpotbugsLayers = {
  readonly effort: string;
  readonly threshold: string;
  readonly filters: readonly Declaration[];
  readonly notApplied: readonly Declaration[];
};

export const declaredConfigFiles: (
  tool: string,
  options: { readonly root: string; readonly files: readonly string[] },
) => { readonly declarations: Map<string, string>; readonly files: string[] } =
  untypedDeclaredConfigFiles;
export const declaredToolChoices: (
  projectRoot: string,
  options: { readonly toolPrecedence: Layers; readonly policyRoot: string },
) => { readonly spotbugs?: Choice } = untypedDeclaredToolChoices;
export const declaredToolDigest: (toolPrecedence: Layers, policyRoot: string) => string =
  untypedDeclaredToolDigest;
export const declaredToolNotices: (config: Layers, source: BuildSource) => string[] =
  untypedDeclaredToolNotices;
export const directorySource: (root: string) => BuildSource = untypedDirectorySource;
export const readDeclaredBuild: (source: BuildSource) => unknown = untypedReadDeclaredBuild;
export const ERRORPRONE: Tool = untypedErrorprone;
export const errorproneDeclarations: (build: unknown) => Declaration[] =
  untypedErrorproneDeclarations;
export const errorproneLayers: (
  declarations: readonly Declaration[],
  options: { readonly projectWins: boolean },
) => SettingLayers = untypedErrorproneLayers;
export const PIT: Tool = untypedPit;
export const pitArguments: (layers: PitLayers) => string[] = untypedPitArguments;
export const pitDeclarations: (build: unknown) => Declaration[] = untypedPitDeclarations;
export const pitLayers: (
  declarations: readonly Declaration[],
  options: { readonly projectWins: boolean },
) => PitLayers = untypedPitLayers;
export const spotbugsArguments: (
  layers: { readonly effort: string; readonly threshold: string },
  filters?: string[],
) => string[] = untypedSpotbugsArguments;
export const spotbugsDeclarations: (build: unknown) => Declaration[] = untypedSpotbugsDeclarations;
export const spotbugsLayers: (
  declarations: readonly Declaration[],
  options: { readonly projectWins: boolean },
) => SpotbugsLayers = untypedSpotbugsLayers;
export const TESTS: Tool = untypedTests;
export const testRetryDeclarations: (build: unknown) => Declaration[] =
  untypedTestRetryDeclarations;
export const testRetryValues: (
  declarations: readonly Declaration[],
) => Readonly<Record<string, number>> = untypedTestRetryValues;

export function sourceOf(files: Readonly<Record<string, string>>): BuildSource {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}
