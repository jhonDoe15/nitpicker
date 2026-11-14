import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { byText } from '../../../../../shared/text-order/by-text.mjs';
import { projectFilePaths } from '../../../../../shared/project-files/project-files.mjs';
import { workflowCommands } from '../../../../../shared/started-files/workflow-commands.mjs';
import { filesStartedByBuildTool } from './build-tool-commands.mjs';
import { filesStartedByCommand } from './command-files.mjs';
import { filesStartedBySource } from './source-starts.mjs';

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/u;
const BUILD_FILE = /(?:\.gradle(?:\.kts)?|(?:^|\/)pom\.xml)$/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);
const MAXIMUM_SOURCE_BYTES = 512 * 1024;
const MANIFEST_FILE = /(?:^|\/)package\.json$/u;

function readText(projectRoot, file) {
  const root = path.resolve(projectRoot);
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) {
    return '';
  }
  return statSync(absolute, { throwIfNoEntry: false })?.size > MAXIMUM_SOURCE_BYTES
    ? ''
    : readFileSync(absolute, 'utf8');
}

function parseManifest(projectRoot, file) {
  try {
    return { parsed: JSON.parse(readText(projectRoot, file)) };
  } catch {
    return { kind: 'malformed-json' };
  }
}

function manifestCommands(projectRoot, file) {
  const manifest = parseManifest(projectRoot, file);
  if (manifest.kind !== undefined) {
    return [];
  }
  const directory = path.posix.dirname(file).replace(/^\.$/u, '');
  return Object.values(manifest.parsed?.scripts ?? {})
    .filter((command) => typeof command === 'string')
    .map((command) => ({ command, directory }));
}

function merged(results) {
  return {
    entryPoints: results.flatMap((result) => result.entryPoints),
    defaultExports: results.flatMap((result) => result.defaultExports),
  };
}

function buildToolFiles(file, text) {
  const directory = path.posix.dirname(file);
  return filesStartedByBuildTool(text).flatMap((started) => [
    started,
    path.posix.normalize(path.posix.join(directory, started)),
  ]);
}

function trackedSorted(list, tracked) {
  return [...new Set(list.filter((file) => tracked.has(file)))].toSorted(byText);
}

export function startedFiles(projectRoot) {
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
