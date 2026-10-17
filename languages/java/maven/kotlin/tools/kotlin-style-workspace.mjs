import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../../core/tooling/temporary-files.mjs';
import { relativeTo } from './kotlin-files.mjs';

const DEFAULTS_FILE = 'ktlint-defaults.editorconfig';
const WORKSPACE = 'workspace';
const ROOT_EDITORCONFIG = { path: '.editorconfig', text: 'root = true\n' };

function inside(root, relative) {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`The style file names ${relative}, which is outside the mirror`);
  }
  return target;
}

function copyInto(directory, files, module) {
  for (const file of files) {
    const target = path.join(directory, relativeTo(module.basedir, file));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
}

// ktlint, and ktfmt when it reads .editorconfig files, run in a mirror of the Kotlin sources, as on
// Gradle: the .editorconfig files above the checkout and the ones the project did not list cannot
// reach them. The mirror holds the .editorconfig files of the style at their repository relative
// paths and the sources of this module at the place they have in the repository, so a section such
// as [src/**/*.kt] of any of them matches the same files as in the repository. The working
// directory is the folder of the module inside the mirror, so the paths in the report stay
// relative to the module.
export function withStyleWorkspace({ module, options, files }, use) {
  const root = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  try {
    const workspace = path.join(root, WORKSPACE);
    mkdirSync(workspace, { recursive: true });
    const { style } = options;
    for (const entry of style.editorconfigs ?? [ROOT_EDITORCONFIG]) {
      const target = inside(workspace, entry.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, entry.text);
    }
    const moduleDirectory = path.join(
      inside(workspace, style.offset ?? ''),
      relativeTo(options.projectRoot, module.basedir),
    );
    mkdirSync(moduleDirectory, { recursive: true });
    copyInto(moduleDirectory, files, module);
    const defaults = path.join(root, DEFAULTS_FILE);
    if (style.ktlintDefaults !== undefined) {
      writeFileSync(defaults, style.ktlintDefaults);
    }
    return use({
      cwd: moduleDirectory,
      defaultsFile: style.ktlintDefaults === undefined ? undefined : defaults,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
    untrackTemporaryPath(root);
  }
}
