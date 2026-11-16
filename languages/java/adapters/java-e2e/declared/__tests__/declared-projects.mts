import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { writeFiles } from '../../../../../../core/diff/git/test-support/fixture-files.mts';
import type { JavaFinding } from '../../../typed/java-values.mts';
import { declaredToolChoices as declaredToolChoicesUntyped } from '../../../tool-config/declared/declared-choices.mjs';
import { readPinnedTools as readPinnedToolsUntyped } from '../../../../builds/java-build.mjs';
import { javaCommand as javaCommandUntyped } from '../../../../maven/maven-command.mjs';
import { resolveTools as resolveToolsUntyped } from '../../../../maven/maven-tools.mjs';

export type Tools = Readonly<Record<string, readonly string[]>>;
export type BuildCommand = { readonly gradle: string } | { readonly maven: string | undefined };
export type ToolChoices = Readonly<
  Partial<Record<string, { readonly arguments?: readonly string[] }>>
>;

export const declaredToolChoices: (
  projectRoot: string,
  options: { toolPrecedence: Readonly<Record<string, readonly string[]>> },
) => ToolChoices = declaredToolChoicesUntyped;

const readPinnedTools: () => unknown = readPinnedToolsUntyped;
const javaCommand: (name: string) => string = javaCommandUntyped;
const resolveTools: (options: {
  projectRoot: string;
  maven: string | undefined;
  pinned: unknown;
  launcherVersions: undefined;
  extraTools: readonly unknown[];
  spawn: undefined;
  timeoutMs: undefined;
}) => Tools = resolveToolsUntyped;

export const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
export const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
export const maven = process.env['NITPICKER_MAVEN'];
export const ORDERINGS: string[][] = [
  ['nitpicker'],
  ['project'],
  ['project', 'nitpicker'],
  ['nitpicker', 'project'],
];
const PROCESS_TIMEOUT_MS = 150_000;
const OUTPUT_BYTES = 64 * 1024 * 1024;
const roots: string[] = [];

export function useDeclaredProjects(): void {
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

export function classpathOf(tools: Tools, name: string): readonly string[] {
  const jars = tools[name];
  if (jars === undefined) {
    throw new Error(`No ${name} classpath was resolved`);
  }
  return jars;
}

export function projectWith(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-declared-e2e-')));
  roots.push(root);
  writeFiles(root, files);
  return root;
}

const resolved = new Map<string, Tools>();

export function pinnedTools(extraTools: readonly unknown[] = []): Tools {
  const key = JSON.stringify(extraTools);
  if (!resolved.has(key)) {
    const projectRoot = projectWith({});
    resolved.set(
      key,
      resolveTools({
        projectRoot,
        maven,
        pinned: readPinnedTools(),
        launcherVersions: undefined,
        extraTools,
        spawn: undefined,
        timeoutMs: undefined,
      }),
    );
  }
  return resolved.get(key) ?? {};
}

export function compiled(
  root: string,
  sources: readonly string[],
  options: { classes?: string; classpath?: readonly string[] } = {},
): string {
  const classes = options.classes ?? path.join(root, 'classes');
  const classpath = options.classpath ?? [];
  mkdirSync(classes, { recursive: true });
  const result = spawnSync(
    javaCommand('javac'),
    [
      ...['-d', classes],
      ...(classpath.length === 0 ? [] : ['-cp', classpath.join(path.delimiter)]),
      ...sources.map((source) => path.join(root, source)),
    ],
    { encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    throw new Error(`javac failed: ${result.stderr}`);
  }
  return classes;
}

export function runJar({
  classpath,
  mainClass,
  args,
  cwd,
}: {
  classpath: readonly string[];
  mainClass: string;
  args: readonly string[];
  cwd: string;
}): SpawnSyncReturns<string> {
  const result = spawnSync(
    javaCommand('java'),
    ['-cp', classpath.join(path.delimiter), mainClass, ...args],
    { cwd, encoding: 'utf8', maxBuffer: OUTPUT_BYTES, timeout: PROCESS_TIMEOUT_MS },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
}

export function ofTool(findings: readonly JavaFinding[], tool: string): string[] {
  return findings
    .filter((finding) => finding.tool === tool)
    .map(({ rule, path: file }) => `${rule} ${path.basename(file)}`)
    .sort();
}
