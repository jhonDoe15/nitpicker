import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import type { FakeProjects, Files, Settings, ContextExtras } from './typed/project-types.mts';
import type { RecordedCall } from './typed/fake-call.mts';
import { parseCall } from './typed/json-views.mts';
import { createToolContext } from './typed/tool-context.mts';
import { installFakeToolchain } from './fake-toolchain.mts';

export function createFakeProjects(): FakeProjects {
  const roots: string[] = [];

  function temporaryRoot(): string {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-fake-')));
    roots.push(root);
    return root;
  }

  function project(files: Files = {}, { tools }: { tools?: readonly string[] } = {}): string {
    const root = temporaryRoot();
    installFakeToolchain(path.join(root, '.venv/bin'), tools);
    mkdirSync(path.join(root, 'src/demo'), { recursive: true });
    writeFiles(root, files);
    return root;
  }

  function contextFor(root: string, settings: Settings = {}, options: ContextExtras = {}) {
    const reportRoot = temporaryRoot();
    return {
      context: createToolContext({
        projectRoot: root,
        liveRoot: root,
        settings,
        reportRoot,
        exclude: [],
        ...options,
      }),
      reportRoot,
    };
  }

  function calls(logFile: string): RecordedCall[] {
    return readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => parseCall(line));
  }

  function cleanup(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { temporaryRoot, project, contextFor, calls, cleanup };
}
