import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { readBaseFiles } from '../../../../../core/fix/changes.mjs';
import { toolConfigChoices } from '../../../adapters/tool-config/tool-config-choices.mjs';
import { detectJavaBuild } from '../../../builds/java-build.mjs';
import { patchChecks } from '../checks/error-prone-checks.mjs';
import { selectHunks } from '../patch/select-hunks.mjs';
import { runGradlePatch } from './gradle-patch.mjs';
import { labelHunks } from '../read/label-hunks.mjs';
import { runMavenPatch } from './maven-patch.mjs';
import { readDiagnostics, readPatches } from '../read/patch-files.mjs';
import { touchedByFile } from '../read/touched-lines.mjs';

const JAVA_FILE = /\.java$/u;

function declaredFlags(projectRoot, headPolicy) {
  return toolConfigChoices(projectRoot, headPolicy).errorprone?.arguments ?? [];
}

function compileForPatch(settings, checks, work) {
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

function liveTexts(projectRoot, files) {
  return new Map(
    files.map(({ path: name }) => [name, readFileSync(containedPath(projectRoot, name), 'utf8')]),
  );
}

export function errorPronePatch(settings, files, mergeBaseSha) {
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
    const touched = touchedByFile({
      files: javaFiles,
      baseSources: readBaseFiles({ repositoryRoot, mergeBaseSha, files: javaFiles }),
      live: liveTexts(projectRoot, javaFiles),
      allFiles: settings.allFiles === true,
    });
    return new Map(
      javaFiles
        .filter(({ path: name }) => patches.has(name))
        .map(({ path: name }) => [
          name,
          selectHunks(
            labelHunks(patches.get(name), diagnostics.get(name) ?? [], checks),
            touched.get(name),
          ),
        ]),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
