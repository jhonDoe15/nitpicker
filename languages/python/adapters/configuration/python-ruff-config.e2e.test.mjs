import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createToolContext } from '../python-tools.mjs';
import { ruffConfigFor } from './python-ruff-config.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const roots = [];

function temporary() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-config-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('the ruff config for the installed ruff', () => {
  it('keeps group selectors and the rules it knows', () => {
    const projectRoot = temporary();
    const context = createToolContext({
      projectRoot,
      liveRoot: projectRoot,
      settings: { environment: 'path', sourceRoots: ['.'] },
      reportRoot: temporary(),
    });

    const text = readFileSync(ruffConfigFor(context), 'utf8');

    const lines = text.split('\n').map((line) => line.trim());

    expect(
      ['"E4",', '"T20",', '"PT001",', '"G004",'].filter((code) => lines.includes(code)),
    ).toEqual(['"E4",', '"T20",', '"PT001",', '"G004",']);
  });
});
