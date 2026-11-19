import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { readBaseFiles as untypedReadBaseFiles } from '../../../../../core/fix/changes.mjs';
import type { FixFile } from '../../../../../core/fix/typed/fix-types.mts';
import { toolConfigChoices } from '../../../adapters/tool-config/tool-config-choices.mjs';
import { detectJavaBuild } from '../../../builds/java-build.mjs';
import { callUntyped } from '../../../adapters/typed/java-values.mts';
import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';
import { patchChecks } from '../checks/error-prone-checks.mts';
import { type LabeledHunk, selectHunks } from '../patch/select-hunks.mts';
import { type PatchRun, runGradlePatch } from './gradle-patch.mts';
import { labelHunks } from '../read/label-hunks.mts';
import { OWN_CHECKS } from '../own/own-checks.mts';
import { runMavenPatch } from './maven-patch.mts';
import { readDiagnostics, readPatches } from '../read/patch-files.mts';
import { touchedByFile } from '../read/touched-lines.mts';

export type PatchSettings = Pick<PatchRun, 'projectRoot' | 'environment' | 'executeFixCommand'> & {
  readonly repositoryRoot: string;
  readonly headPolicy?: unknown;
  readonly selectedRules?: readonly string[];
  readonly allFiles: boolean;
};

const JAVA_FILE = /\.java$/u;
const OWN_CHECK_NAMES: ReadonlySet<string> = new Set(OWN_CHECKS.map(({ check }) => check));
const readBaseFiles: (options: {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string | undefined;
  readonly files: readonly FixFile[];
}) => ReadonlyMap<string, string> = untypedReadBaseFiles;

function declaredFlags(projectRoot: string, headPolicy: unknown): string[] {
  const choices = callUntyped(toolConfigChoices, projectRoot, headPolicy);
  return textsOf(fieldOf(fieldOf(choices, 'errorprone'), 'arguments'));
}

function compileForPatch(settings: PatchSettings, checks: readonly string[], work: string) {
  const { projectRoot, headPolicy = {}, environment, executeFixCommand } = settings;
  const run = detectJavaBuild(projectRoot) === 'maven' ? runMavenPatch : runGradlePatch;
  return run({
    projectRoot,
    environment,
    executeFixCommand,
    work,
    checks,
    flags: declaredFlags(projectRoot, headPolicy),
  });
}

function liveTexts(projectRoot: string, files: readonly FixFile[]): Map<string, string> {
  return new Map(
    files.map(({ path: name }) => [name, readFileSync(containedPath(projectRoot, name), 'utf8')]),
  );
}

export function errorPronePatch(
  settings: PatchSettings,
  files: readonly FixFile[],
  mergeBaseSha: string | undefined,
): Map<string, LabeledHunk[]> {
  const javaFiles = files.filter(({ path: name }) => JAVA_FILE.test(name));
  const checks = patchChecks(settings.selectedRules ?? []);
  if (javaFiles.length === 0 || checks.length === 0) {
    return new Map();
  }
  const { projectRoot, repositoryRoot } = settings;
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-error-prone-fix-'));
  try {
    const { patchRoot, reportRoot } = compileForPatch(settings, checks, work);
    const patches = readPatches({ patchRoot, projectRoot });
    const diagnostics = readDiagnostics({ reportRoot, projectRoot });
    const live = settings.allFiles ? new Map<string, string>() : liveTexts(projectRoot, javaFiles);
    const touched = touchedByFile({
      files: javaFiles,
      baseSources: settings.allFiles
        ? new Map()
        : readBaseFiles({ repositoryRoot, mergeBaseSha, files: javaFiles }),
      live,
      allFiles: settings.allFiles,
    });
    return new Map(
      javaFiles.flatMap(({ path: name }): [string, LabeledHunk[]][] => {
        const hunks = patches.get(name);
        return hunks === undefined
          ? []
          : [
              [
                name,
                selectHunks(
                  labelHunks(hunks, diagnostics.get(name) ?? [], {
                    checks,
                    spanChecks: OWN_CHECK_NAMES,
                  }),
                  touched.get(name) ?? 'all',
                  live.get(name),
                ),
              ],
            ];
      }),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
