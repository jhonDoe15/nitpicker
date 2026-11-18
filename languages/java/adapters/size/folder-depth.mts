import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';

type PackageEntry = { readonly path: string; readonly packagePath: string };

type FolderDepthOptions = {
  readonly analyzerName: string;
  readonly thresholds?: unknown;
  readonly exceptions?: unknown;
  readonly rootEntries?: readonly PackageEntry[];
};

const WORDING = {
  subject: 'Package',
  below: 'the root package',
  advice: (limit: number) =>
    `Keep packages at most ${String(limit)} levels below the root package: group by responsibility instead of nesting.`,
};

function segments(packagePath: string): string[] {
  return packagePath === '' ? [] : packagePath.split('/');
}

const DESCRIPTORS = new Set(['module-info.java', 'package-info.java']);

function votesForRoot({ path: file, packagePath }: PackageEntry): boolean {
  return packagePath !== '' && !DESCRIPTORS.has(file.slice(file.lastIndexOf('/') + 1));
}

function commonPrefix(entries: readonly PackageEntry[]): string[] {
  const voting = entries.filter(votesForRoot);
  if (voting.length === 0) {
    return [];
  }
  const [first = [], ...others] = voting.map(({ packagePath }) => segments(packagePath));
  return others.reduce((prefix, other) => prefix.slice(0, sharedLength(prefix, other)), first);
}

function sharedLength(prefix: readonly string[], other: readonly string[]): number {
  const mismatch = prefix.findIndex((part, index) => other[index] !== part);
  return mismatch === -1 ? prefix.length : mismatch;
}

function depthBelow(root: readonly string[], packagePath: string): number {
  const parts = segments(packagePath);
  const underRoot = root.every((part, index) => parts[index] === part);
  return underRoot ? parts.length - root.length : parts.length;
}

export function javaFolderDepthFindings(
  entries: readonly PackageEntry[],
  { analyzerName, thresholds = {}, exceptions, rootEntries = entries }: FolderDepthOptions,
): JavaFinding[] {
  if (entries.length === 0) {
    return [];
  }
  const root = commonPrefix(rootEntries.length === 0 ? entries : rootEntries);
  const findings: unknown = callUntyped(folderDepthFindings, entries, {
    analyzerName,
    limit: fieldOf(thresholds, 'folderDepth') ?? FOLDER_DEPTH_DEFAULTS.java,
    exceptions,
    wording: WORDING,
    depthOf: ({ packagePath }: PackageEntry) => depthBelow(root, packagePath),
  });
  return findingsOf(findings);
}
