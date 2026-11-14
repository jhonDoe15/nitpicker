import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../../core/tooling/temporary-files.mjs';
import { relativeTo } from '../../module/module-paths.mts';
import type {
  EditorConfigFile,
  KotlinModule,
  KotlinOptions,
  KotlinStyle,
} from '../../typed/kotlin-types.mts';

type WorkspaceRequest = {
  readonly module: Pick<KotlinModule, 'basedir'>;
  readonly options: Pick<KotlinOptions, 'projectRoot' | 'style'>;
  readonly files: readonly string[];
};
type Workspace = { readonly cwd: string; readonly defaultsFile: string | undefined };

const track: (file: string) => string = trackTemporaryPath;

const DEFAULTS_FILE = 'ktlint-defaults.editorconfig';
const WORKSPACE = 'workspace';
const ROOT_EDITORCONFIG: EditorConfigFile = { path: '.editorconfig', text: 'root = true\n' };

function inside(root: string, ...segments: string[]): string {
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`The style file names ${segments.join('/')}, which is outside the mirror`);
  }
  return target;
}

function copyInto(
  directory: string,
  files: readonly string[],
  module: Pick<KotlinModule, 'basedir'>,
): void {
  for (const file of files) {
    const target = inside(directory, relativeTo(module.basedir, file));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
}

function writeEditorconfigs(workspace: string, style: KotlinStyle): void {
  for (const entry of style.editorconfigs ?? [ROOT_EDITORCONFIG]) {
    const target = inside(workspace, entry.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, entry.text);
  }
}

function buildWorkspace(root: string, { module, options, files }: WorkspaceRequest): Workspace {
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

export function withStyleWorkspace<Result>(
  request: WorkspaceRequest,
  use: (workspace: Workspace) => Result,
): Result {
  const root = track(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  try {
    return use(buildWorkspace(root, request));
  } finally {
    rmSync(root, { recursive: true, force: true });
    untrackTemporaryPath(root);
  }
}
