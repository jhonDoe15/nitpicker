import { vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import type { Files, Scratch, ScratchProject } from './typed/project-types.mts';
import { createToolContext } from './typed/tool-context.mts';
import { installFakeToolchain } from './fake-toolchain.mts';

function writeProjectFiles(root: string, files: Files): string {
  writeFiles(root, files);
  return root;
}

export function createScratch(): Scratch {
  const roots: string[] = [];

  function directory(): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-scratch-')));
    roots.push(root);
    return root;
  }

  function setEnvironment(name: string, value: string | undefined): void {
    vi.stubEnv(name, value);
  }

  function project({
    files = {},
    tools,
  }: { files?: Files; tools?: readonly string[] } = {}): ScratchProject {
    const root = writeProjectFiles(directory(), files);
    installFakeToolchain(path.join(root, '.venv/bin'), tools);
    const reportRoot = directory();
    return {
      root,
      reportRoot,
      context: createToolContext({ projectRoot: root, liveRoot: root, reportRoot }),
    };
  }

  function cleanup(): void {
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { directory, write: writeProjectFiles, setEnvironment, project, cleanup };
}
