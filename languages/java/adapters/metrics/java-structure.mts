import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher as untypedGlobMatcher } from '../../../../shared/paths/glob.mjs';
import {
  methodText,
  readStructureFindings,
  STRUCTURE_TOOL,
} from '../../../../shared/ingest/structure-report.mjs';
import { collectFileLimitFindings } from '../../../../shared/rules/file-limits.mjs';
import { javaFolderDepthFindings } from '../size/folder-depth.mts';
import { javaLineLengthFindings } from '../size/line-length.mts';
import { javaLineLength } from '../style/java-style.mts';
import { projectFilePaths } from '../../../../shared/project-files/project-files.mjs';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import { textsOf } from '../../../../shared/values/readers.mts';
import type {
  CodeEntry,
  CodeKind,
  FileLimitOptions,
  MethodEntry,
  ProjectManifest,
  SourceCache,
} from './java-structure-types.mts';

const globMatcher: (glob: string) => { test(file: string): boolean } = untypedGlobMatcher;

export function readJavaStructureFindings(
  reportRoot: string,
  projectRoot: string,
  reactorRoot = projectRoot,
): JavaFinding[] {
  return findingsOf(
    callUntyped(readStructureFindings, reportRoot, projectRoot, {
      textOf: (sources: SourceCache, root: string, entry: MethodEntry) =>
        javaMethodText(sources, { projectRoot: root, reactorRoot }, entry),
    }),
  );
}

export function javaMethodText(
  sources: SourceCache,
  {
    projectRoot,
    reactorRoot = projectRoot,
  }: { readonly projectRoot: string; readonly reactorRoot?: string },
  entry: MethodEntry,
): string {
  return String(
    callUntyped(methodText, sources, reactorRoot, {
      ...entry,
      file: path.relative(reactorRoot, path.resolve(projectRoot, entry.file)),
    }),
  );
}

const SOURCE_ROOT_KEYS = { source: 'sourceRoots', test: 'testSourceRoots' } as const;
const KOTLIN_ROOT_KEYS = {
  source: 'kotlinSourceRoots',
  test: 'kotlinTestSourceRoots',
} as const;

const JAVA_EXTENSION = '.java';
const OUTSIDE_SOURCES = /^(?:$|\.\.(?:\/|$)|build(?:\/|$))/u;

function rootsOf(manifest: ProjectManifest, kind: CodeKind, kotlin: boolean): string[] {
  return [
    ...(manifest[SOURCE_ROOT_KEYS[kind]] ?? []),
    ...(kotlin ? (manifest[KOTLIN_ROOT_KEYS[kind]] ?? []) : []),
  ].filter((root) => !OUTSIDE_SOURCES.test(root));
}

function projectCodeFiles(
  projectRoot: string,
  {
    manifest,
    kotlin,
    exclude,
  }: { readonly manifest: ProjectManifest; readonly kotlin: boolean; readonly exclude?: unknown },
): CodeEntry[] {
  const excluders = textsOf(exclude).map((glob) => globMatcher(glob));
  return [
    ...codeFiles(projectRoot, {
      roots: rootsOf(manifest, 'source', kotlin),
      kind: 'source',
      kotlin,
    }),
    ...codeFiles(projectRoot, { roots: rootsOf(manifest, 'test', kotlin), kind: 'test', kotlin }),
  ].filter((entry) => !excluders.some((matcher) => matcher.test(entry.path)));
}

export function readJavaFileLimitFindings(
  projectRoot: string,
  { manifest, kotlin, policy = {} }: FileLimitOptions,
): JavaFinding[] {
  const entries = projectCodeFiles(projectRoot, { manifest, kotlin, exclude: policy.exclude });
  const rootEntries =
    policy.baselineRoot === undefined
      ? entries
      : projectCodeFiles(policy.baselineRoot, { manifest, kotlin, exclude: policy.exclude });
  const options = {
    analyzerName: STRUCTURE_TOOL,
    thresholds: policy.thresholds,
    exceptions: policy.exceptions,
  };
  return [
    ...findingsOf(
      callUntyped(collectFileLimitFindings, projectRoot, entries, {
        ...options,
        checks: ['fileLines', 'folderFiles'],
      }),
    ),
    ...javaLineLengthFindings(javaFiles(projectRoot, entries), {
      ...options,
      lineLength: Number(callUntyped(javaLineLength, policy.conventions)),
    }),
    ...javaFolderDepthFindings(entries, { ...options, rootEntries }),
  ];
}

function javaFiles(
  projectRoot: string,
  entries: readonly CodeEntry[],
): (CodeEntry & { readonly text: string })[] {
  const base = path.resolve(projectRoot);
  return entries
    .filter((entry) => entry.path.endsWith(JAVA_EXTENSION))
    .flatMap((entry) => {
      const full = path.resolve(base, entry.path);
      if (!full.startsWith(base + path.sep)) {
        return [];
      }
      return [{ ...entry, text: readFileSync(full, 'utf8') }];
    });
}

function codeFiles(
  projectRoot: string,
  {
    roots,
    kind,
    kotlin,
  }: { readonly roots: readonly string[]; readonly kind: CodeKind; readonly kotlin: boolean },
): CodeEntry[] {
  const extensions = kotlin ? [JAVA_EXTENSION, '.kt'] : [JAVA_EXTENSION];
  return [...new Set(roots)].flatMap((root) =>
    textsOf(callUntyped(projectFilePaths, path.join(projectRoot, root)))
      .filter((file) => extensions.includes(path.extname(file)))
      .map((file) => ({
        path: path.posix.join(root, file),
        packagePath: path.posix.dirname(file).replace(/^\.$/u, ''),
        kind,
      })),
  );
}
