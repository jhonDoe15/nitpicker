import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { byText } from '../../../../../shared/text-order/by-text.mjs';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { workflowCommands as untypedWorkflowCommands } from '../../../../../shared/started-files/workflow-commands.mjs';
import { filesStartedByBuildTool } from './build-tool-commands.mts';
import { filesStartedByCommand } from './command-files.mts';
import { filesStartedBySource } from './source-starts.mts';

type Found = { entryPoints: string[]; defaultExports: string[] };
type Command = { readonly command: string; readonly directory: string };

const projectFilePaths: (
  root: string,
  options: { skipDirectory: (directory: string, entry: { name: string }) => boolean },
) => string[] = untypedProjectFilePaths;
const workflowCommands: (text: string) => Command[] = untypedWorkflowCommands;

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/u;
const BUILD_FILE = /(?:\.gradle(?:\.kts)?|(?:^|\/)pom\.xml)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const MAXIMUM_SOURCE_BYTES = 512 * 1024;
const MANIFEST_FILE = /(?:^|\/)package\.json$/u;

function readText(projectRoot: string, file: string): string {
  const root = path.resolve(projectRoot);
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) {
    return '';
  }
  return (statSync(absolute, { throwIfNoEntry: false })?.size ?? 0) > MAXIMUM_SOURCE_BYTES
    ? ''
    : readFileSync(absolute, 'utf8');
}

function parseManifest(
  projectRoot: string,
  file: string,
): { parsed: unknown; kind?: undefined } | { kind: 'malformed-json' } {
  try {
    const parsed: unknown = JSON.parse(readText(projectRoot, file));
    return { parsed };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function manifestCommands(projectRoot: string, file: string): Command[] {
  const manifest = parseManifest(projectRoot, file);
  if (manifest.kind !== undefined) {
    return [];
  }
  const directory = path.posix.dirname(file).replace(/^\.$/u, '');
  const scripts: unknown = fieldOf(manifest.parsed, 'scripts');
  return Object.values(typeof scripts === 'object' && scripts !== null ? scripts : {})
    .filter((command) => typeof command === 'string')
    .map((command) => ({ command, directory }));
}

function merged(results: readonly Found[]): Found {
  return {
    entryPoints: results.flatMap((result) => result.entryPoints),
    defaultExports: results.flatMap((result) => result.defaultExports),
  };
}

function buildToolFiles(file: string, text: string): string[] {
  const directory = path.posix.dirname(file);
  return filesStartedByBuildTool(text).flatMap((started) => [
    started,
    path.posix.normalize(path.posix.join(directory, started)),
  ]);
}

function trackedSorted(list: readonly string[], tracked: ReadonlySet<string>): string[] {
  return [...new Set(list.filter((file) => tracked.has(file)))].toSorted(byText);
}

export function startedFiles(projectRoot: string): Found {
  const files = projectFilePaths(projectRoot, {
    skipDirectory: (_, { name }) => SKIPPED_DIRECTORIES.has(name),
  });
  const commands = [
    ...files
      .filter((file) => MANIFEST_FILE.test(file))
      .flatMap((file) => manifestCommands(projectRoot, file)),
    ...files
      .filter((file) => WORKFLOW_FILE.test(file))
      .flatMap((file) => workflowCommands(readText(projectRoot, file))),
  ];
  const fromCommands = merged(
    commands.map(({ command, directory }) => filesStartedByCommand(command, directory)),
  );
  const candidates = [
    ...fromCommands.entryPoints,
    ...files
      .filter((file) => BUILD_FILE.test(file))
      .flatMap((file) => buildToolFiles(file, readText(projectRoot, file))),
    ...files
      .filter((file) => SOURCE_FILE.test(file))
      .flatMap((file) => filesStartedBySource(file, readText(projectRoot, file))),
  ];
  const tracked = new Set(files);
  return {
    entryPoints: trackedSorted(candidates, tracked),
    defaultExports: trackedSorted(fromCommands.defaultExports, tracked),
  };
}
