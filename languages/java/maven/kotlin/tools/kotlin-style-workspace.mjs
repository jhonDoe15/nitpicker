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

function inside(root, ...segments) {
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`The style file names ${segments.join('/')}, which is outside the mirror`);
  }
  return target;
}

function copyInto(directory, files, module) {
  for (const file of files) {
    const target = inside(directory, relativeTo(module.basedir, file));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
}

function writeEditorconfigs(workspace, style) {
  for (const entry of style.editorconfigs ?? [ROOT_EDITORCONFIG]) {
    const target = inside(workspace, entry.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.text);
  }
}

function buildWorkspace(root, { module, options, files }) {
  const workspace = path.join(root, WORKSPACE);
  mkdirSync(workspace, { recursive: true });
  const { style } = options;
  writeEditorconfigs(workspace, style);
  const moduleDirectory = inside(
    workspace,
    style.offset ?? '',
    relativeTo(options.projectRoot, module.basedir),
  );
  mkdirSync(moduleDirectory, { recursive: true });
  copyInto(moduleDirectory, files, module);
  const defaults = path.join(root, DEFAULTS_FILE);
  if (style.ktlintDefaults !== undefined) {
    writeFileSync(defaults, style.ktlintDefaults);
  }
  return {
    cwd: moduleDirectory,
    defaultsFile: style.ktlintDefaults === undefined ? undefined : defaults,
  };
}

export function withStyleWorkspace(request, use) {
  const root = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  try {
    return use(buildWorkspace(root, request));
  } finally {
    rmSync(root, { recursive: true, force: true });
    untrackTemporaryPath(root);
  }
}
