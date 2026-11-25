import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import type { LintMessage } from '../plan/oxlint-shapes.mts';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { oxlintOptions } from './oxlint-runs.mts';

const EXECUTABLE = 0o755;

type Recorded = { readonly argumentsFile: string; readonly listFile: string };

function recording(recorded: Recorded | undefined): string[] {
  if (recorded === undefined) {
    return [];
  }
  return [`echo "$@" > ${JSON.stringify(recorded.argumentsFile)}`];
}

function listCopy(recorded: Recorded | undefined): string[] {
  if (recorded === undefined) {
    return [];
  }
  return [`  if [ "$1" = "--files" ]; then cp "$2" ${JSON.stringify(recorded.listFile)}; fi`];
}

export function writeStubEngine(
  root: string,
  rows: readonly unknown[],
  recorded?: Recorded,
): string {
  const stub = path.join(root, 'stub-engine.sh');
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      ...recording(recorded),
      'while [ $# -gt 0 ]; do',
      '  if [ "$1" = "--out" ]; then out="$2"; fi',
      ...listCopy(recorded),
      '  shift',
      'done',
      'cat > "$out" <<\'ROWS\'',
      JSON.stringify(rows),
      'ROWS',
    ].join('\n'),
  );
  chmodSync(stub, EXECUTABLE);
  return stub;
}

export function removedAfterAll(root: string): void {
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

export async function reportedLines(
  {
    root,
    patterns,
    engine,
    environment,
  }: { root: string; patterns: readonly string[]; engine: string; environment: Environment },
  line: (file: string, message: LintMessage) => string | undefined,
): Promise<string[]> {
  const results = await lintWithOxlint({
    options: oxlintOptions(root, patterns),
    projectConfigPath: undefined,
    environment: {
      ...environment,
      NITPICKER_ENGINE: engine,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => Promise.resolve([]),
  });
  return results.flatMap(({ filePath, messages }) =>
    messages.flatMap((message) => line(path.basename(filePath), message) ?? []),
  );
}
