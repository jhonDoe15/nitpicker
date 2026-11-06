import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { readPinnedTools } from '../../../../builds/java-build.mjs';
import { javaCommand } from '../../../../maven/maven-command.mjs';
import { resolveTools } from '../../../../maven/maven-tools.mjs';

export const enabled = process.env.NITPICKER_JAVA_E2E === '1';
export const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
export const maven = process.env.NITPICKER_MAVEN;
export const ORDERINGS = [
  ['nitpicker'],
  ['project'],
  ['project', 'nitpicker'],
  ['nitpicker', 'project'],
];
const PROCESS_TIMEOUT_MS = 150_000;
const OUTPUT_BYTES = 64 * 1024 * 1024;
const roots = [];

export function useDeclaredProjects() {
  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

export function projectWith(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-declared-e2e-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

let resolved;

export function pinnedTools() {
  resolved ??= resolveTools({ projectRoot: projectWith({}), maven, pinned: readPinnedTools() });
  return resolved;
}

export function compiled(root, sources) {
  const classes = path.join(root, 'classes');
  mkdirSync(classes, { recursive: true });
  const result = spawnSync(
    javaCommand('javac'),
    ['-d', classes, ...sources.map((source) => path.join(root, source))],
    { encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    throw new Error(`javac failed: ${result.stderr}`);
  }
  return classes;
}

export function runJar({ classpath, mainClass, args, cwd }) {
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

export function ofTool(findings, tool) {
  return findings
    .filter((finding) => finding.tool === tool)
    .map(({ rule, path: file }) => `${rule} ${path.basename(file)}`)
    .sort();
}
