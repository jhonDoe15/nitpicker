import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readImportsReport, scanImports } from '../python-coupling.mjs';
import { run } from '../python-process.mjs';
import { createToolContext } from '../python-tools.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scan(code) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-import-scan-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-import-report-')));
  roots.push(root, reportRoot);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/mod.py'), code);
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['src'] },
    reportRoot,
  });
  scanImports(context, run);
  return readImportsReport(reportRoot).imports['src/mod.py'].map(
    ({ module, names, typeOnly }) => `${module ?? '-'} ${names.join(',')} ${String(typeOnly)}`,
  );
}

describe.skipIf(!enabled)('import scan of if TYPE_CHECKING blocks', () => {
  it.each([
    [
      'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    import a\n',
      ['typing TYPE_CHECKING false', '- a true'],
    ],
    [
      'import typing\nif typing.TYPE_CHECKING:\n    from b import c\n',
      ['- typing false', 'b c true'],
    ],
    ['import typing as t\nif t.TYPE_CHECKING:\n    import a\n', ['- typing false', '- a true']],
    [
      'from typing import TYPE_CHECKING as TC\nif TC:\n    import a\n',
      ['typing TYPE_CHECKING false', '- a true'],
    ],
    [
      'from typing_extensions import TYPE_CHECKING\nif TYPE_CHECKING:\n    import a\n',
      ['typing_extensions TYPE_CHECKING false', '- a true'],
    ],
    ['if TYPE_CHECKING and sys.version_info >= (3, 9):\n    import a\n', ['- a true']],
    [
      'if TYPE_CHECKING:\n    if x:\n        import a\n    def f():\n        import b\n',
      ['- a true', '- b true'],
    ],
    ['if TYPE_CHECKING:\n    import a\nelse:\n    import b\n', ['- a true', '- b false']],
    ['if not TYPE_CHECKING:\n    import a\n', ['- a false']],
    ['if TYPE_CHECKING or debug:\n    import a\n', ['- a false']],
    ['if debug:\n    import a\n', ['- a false']],
    ['try:\n    import a\nexcept ImportError:\n    import b\n', ['- a false', '- b false']],
    ['def f():\n    import a\n', ['- a false']],
  ])('%j', (code, expected) => {
    expect(scan(code)).toEqual(expected);
  });
});
