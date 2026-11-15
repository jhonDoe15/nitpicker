import type TypeScript from 'typescript';
import type { Finding } from '../../adapters/static-checks/shared.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { withoutImportOnlyClones as untypedWithoutImportOnlyClones } from '../../../../core/tooling/jscpd/import-only.mjs';
import { jscpdClones as untypedJscpdClones } from '../../../../core/tooling/jscpd/jscpd-clones.mjs';
import { renamedJscpdSettings as untypedRenamedJscpdSettings } from '../../../../core/tooling/jscpd/config.mjs';
import { evaluateDuplicates as untypedEvaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import {
  renamedClones as untypedRenamedClones,
  renamedFindings as untypedRenamedFindings,
  withoutRenamedCopies as untypedWithoutRenamedCopies,
} from '../../../../shared/renamed-clones/findings.mjs';
import { sourceFilesUnder as untypedSourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import {
  RENAMED_SETTINGS as untypedRenamedSettings,
  withNormalizedTree as untypedWithNormalizedTree,
} from '../../../../shared/renamed-clones/tree.mjs';
import {
  codeExtensionNames as untypedCodeExtensionNames,
  existingRoots as untypedExistingRoots,
  sourceRoot as untypedSourceRoot,
} from '../layout.mjs';

type CloneSide = { readonly file: string; readonly line: number };

export type JscpdClone = {
  readonly first: CloneSide;
  readonly second: CloneSide;
  readonly fragment?: string | undefined;
  readonly lines?: number | undefined;
  readonly tokens?: number | undefined;
};

export type RenamedClone = JscpdClone & { readonly original: string };

type RenamedScratch = { readonly tree: string; readonly scratch: string };

type NormalizedTree = {
  readonly projectRoot: string;
  readonly files: string[];
  readonly syntaxOf: () => string;
  readonly typescript: typeof TypeScript;
  readonly scratchRoot: string;
  readonly temporaryPaths: {
    readonly track: (filePath: string) => string;
    readonly untrack: (filePath: string) => void;
  };
};

type RenamedSettings = {
  readonly path: string[];
  readonly [key: string]: unknown;
};

const rootValue: unknown = untypedSourceRoot;

export const sourceRoot: string = textOf(rootValue);

export const codeExtensionNames: string[] = untypedCodeExtensionNames;

export const existingRoots: (root: string, roots: readonly string[]) => string[] =
  untypedExistingRoots;

export const withoutImportOnlyClones: (clones: JscpdClone[], format: string) => JscpdClone[] =
  untypedWithoutImportOnlyClones;

export const jscpdClones: (report: unknown, configuredPaths: readonly string[]) => JscpdClone[] =
  untypedJscpdClones;

export const evaluateDuplicates: (
  clones: readonly JscpdClone[],
  analyzerName: string,
) => Finding[] = untypedEvaluateDuplicates;

export const renamedClones: (
  clones: JscpdClone[],
  options: { readonly projectRoot: string; readonly syntax: string },
) => RenamedClone[] = untypedRenamedClones;

export const renamedFindings: (
  clones: RenamedClone[],
  analyzerName: string,
  testAdvice: { readonly isTestFile: (file: string) => boolean; readonly text: string },
) => Finding[] = untypedRenamedFindings;

export const withoutRenamedCopies: (
  plainClones: JscpdClone[],
  renamed: RenamedClone[],
) => JscpdClone[] = untypedWithoutRenamedCopies;

export const sourceFilesUnder: (
  projectRoot: string,
  roots: readonly string[],
  extensions: readonly string[],
) => string[] = untypedSourceFilesUnder;

export const RENAMED_SETTINGS: unknown = untypedRenamedSettings;

export const renamedJscpdSettings: (config: unknown, renamed: unknown) => RenamedSettings =
  untypedRenamedJscpdSettings;

export const withNormalizedTree: <Result>(
  tree: NormalizedTree,
  work: (scratch: RenamedScratch) => Result,
) => Result = untypedWithNormalizedTree;
