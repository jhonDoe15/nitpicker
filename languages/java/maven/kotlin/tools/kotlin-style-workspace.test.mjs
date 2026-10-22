import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withStyleWorkspace } from './kotlin-style-workspace.mjs';

const roots = [];

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-workspace-'));
  roots.push(root);
  const source = path.join(root, 'app/src/main/kotlin/A.kt');
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(source, 'class A\n');
  return { root, module: { basedir: path.join(root, 'app') }, source };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('withStyleWorkspace', () => {
  it('mirrors the editorconfig files and the module sources at their repository paths, then removes the mirror', () => {
    const { root, module, source } = project();
    const options = {
      projectRoot: root,
      style: {
        offset: 'service',
        editorconfigs: [
          { path: '.editorconfig', text: 'root = true\n' },
          { path: 'service/app/.editorconfig', text: '[*.kt]\nindent_size = 4\n' },
        ],
        ktlintDefaults: '[*.{kt,kts}]\nindent_size = 2\n',
      },
    };
    let seen;

    withStyleWorkspace({ module, options, files: [source] }, ({ cwd, defaultsFile }) => {
      seen = { cwd, defaultsFile };
      expect(readFileSync(path.join(cwd, 'src/main/kotlin/A.kt'), 'utf8')).toBe('class A\n');
      expect(readFileSync(path.join(cwd, '.editorconfig'), 'utf8')).toBe(
        '[*.kt]\nindent_size = 4\n',
      );
      expect(readFileSync(defaultsFile, 'utf8')).toBe('[*.{kt,kts}]\nindent_size = 2\n');
      expect(path.basename(path.dirname(cwd))).toBe('service');
    });

    expect(existsSync(seen.cwd)).toBe(false);
  });

  it('starts from a root editorconfig and no defaults when the style has none, and refuses a path outside the mirror', () => {
    const { root, module, source } = project();

    withStyleWorkspace(
      { module, options: { projectRoot: root, style: {} }, files: [source] },
      (workspace) => {
        expect(workspace.defaultsFile).toBeUndefined();
      },
    );
    expect(() =>
      withStyleWorkspace(
        {
          module,
          options: {
            projectRoot: root,
            style: { editorconfigs: [{ path: '../escape/.editorconfig', text: '' }] },
          },
          files: [source],
        },
        () => undefined,
      ),
    ).toThrow('outside the mirror');
  });
});
