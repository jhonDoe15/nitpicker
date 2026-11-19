import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside as untypedPathInside } from '../../../../../shared/filesystem.mjs';
import {
  hash as untypedHash,
  nextOccurrence as untypedNextOccurrence,
} from '../../../../../shared/rules/finding-helpers.mjs';
import { lineOf, lineText, scanKotlinSource } from './kotlin-source.mts';
import { kotlinDeclarations } from './security/sql-values.mts';
import { generatedFile } from './rules/markers.mts';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mjs';
import { directoryRules as generatedRules } from './rules/source-rules.generated.mts';
import type { Reported, RuleSet, SourceRule } from './typed/rule-shapes.mts';
import type { Scanned } from './typed/scan-shapes.mts';

type ScannedFile = { file: string; scanned: Scanned };
type SourceFile = { file: string; absolute: string };
type Manifest = { kotlinSourceRoots?: string[]; kotlinTestSourceRoots?: string[] };
type FindingState = ScannedFile & { occurrences: Map<string, number> };

export type SourceFinding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  message: string;
  classification: string;
  location: { line: number };
};

const pathInside: (root: string, relative: string) => string | undefined = untypedPathInside;
const hash: (value: string) => string = untypedHash;
const nextOccurrence: (occurrences: Map<string, number>, key: string) => number =
  untypedNextOccurrence;
const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;
const directoryRules: readonly RuleSet[] = generatedRules;

const KOTLIN_SOURCE_TOOL = 'kotlin-source';

export const KOTLIN_SOURCE_MESSAGES: Record<string, string> = Object.fromEntries(
  directoryRules.flatMap(({ messages = {} }) => Object.entries(messages)),
);

export const KOTLIN_SOURCE_RULES = Object.keys(KOTLIN_SOURCE_MESSAGES).map(
  (rule) => `${KOTLIN_SOURCE_TOOL}/${rule}`,
);

const MAIN_RULES: SourceRule[] = directoryRules.flatMap(({ main = [] }) => main);
const TEST_RULES: SourceRule[] = directoryRules.flatMap(({ test = [] }) => test);

function kotlinFiles(projectRoot: string, sourceRoots: string[]): SourceFile[] {
  const files = sourceRoots.flatMap((sourceRoot) => {
    const directory = pathInside(projectRoot, sourceRoot);
    if (directory === undefined) {
      return [];
    }
    return projectFilePaths(directory)
      .filter((entry) => entry.endsWith('.kt'))
      .map((entry) => ({
        file: path.posix.join(sourceRoot, entry),
        absolute: path.join(directory, ...entry.split('/')),
      }));
  });
  const byFile = new Map(files.map((entry): [string, SourceFile] => [entry.file, entry]));
  return [...byFile.values()].toSorted((left, right) => (left.file < right.file ? -1 : 1));
}

function finding({ file, scanned, occurrences }: FindingState, reported: Reported): SourceFinding {
  const line = lineOf(scanned, reported.offset);
  const subject = reported.subject ?? lineText(scanned, line).trim().replaceAll(/\s+/g, ' ');
  const key = `${reported.rule}\0${subject}`;
  const occurrence = nextOccurrence(occurrences, key);
  return {
    tool: KOTLIN_SOURCE_TOOL,
    rule: reported.rule,
    path: file,
    identity: `${reported.rule}:${hash(subject)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
    message: reported.message ?? KOTLIN_SOURCE_MESSAGES[reported.rule] ?? '',
    classification: 'enforceable',
    location: { line },
  };
}

function scannedFiles(projectRoot: string, sourceRoots: string[]): ScannedFile[] {
  return kotlinFiles(projectRoot, sourceRoots)
    .map(({ file, absolute }) => ({
      file,
      scanned: scanKotlinSource(readFileSync(absolute, 'utf8')),
    }))
    .filter(({ scanned }) => !generatedFile(scanned));
}

function scanFiles(files: ScannedFile[], rules: SourceRule[], runners: string[]): SourceFinding[] {
  const context = {
    declarations: kotlinDeclarations(files.map(({ scanned }) => scanned)),
    runners,
  };
  return files.flatMap(({ file, scanned }) => {
    const occurrences = new Map<string, number>();
    return rules
      .flatMap((rule) => rule(scanned, { ...context, file }))
      .toSorted((left, right) => left.offset - right.offset)
      .map((reported) => finding({ file, scanned, occurrences }, reported));
  });
}

export function readKotlinSourceFindings(
  projectRoot: string,
  manifest: Manifest,
  runners: string[] = [],
): SourceFinding[] {
  return [
    ...scanFiles(scannedFiles(projectRoot, manifest.kotlinSourceRoots ?? []), MAIN_RULES, runners),
    ...scanFiles(
      scannedFiles(projectRoot, manifest.kotlinTestSourceRoots ?? []),
      TEST_RULES,
      runners,
    ),
  ];
}
