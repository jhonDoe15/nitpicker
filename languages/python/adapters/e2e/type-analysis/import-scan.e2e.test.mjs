import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readImportsReport, scanImports } from '../../analysis/python-coupling.mjs';
import { run } from '../../execution/python-process.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { pythonE2eEnabled } from '../test-support/python-e2e-support.mjs';

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

describe.skipIf(!pythonE2eEnabled)('import scan of if TYPE_CHECKING blocks', () => {
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
    [
      'from typing import TYPE_CHECKING\nif TYPE_CHECKING and sys.version_info >= (3, 9):\n    import a\n',
      ['typing TYPE_CHECKING false', '- a true'],
    ],
    [
      'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    if x:\n        import a\n    def f():\n        import b\n',
      ['typing TYPE_CHECKING false', '- a true', '- b true'],
    ],
    [
      'from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    import a\nelse:\n    import b\n',
      ['typing TYPE_CHECKING false', '- a true', '- b false'],
    ],
    [
      'from typing import TYPE_CHECKING\nif not TYPE_CHECKING:\n    import a\nelse:\n    import b\n',
      ['typing TYPE_CHECKING false', '- a false', '- b true'],
    ],
    [
      'from typing import TYPE_CHECKING\nif TYPE_CHECKING or debug:\n    import a\n',
      ['typing TYPE_CHECKING false', '- a false'],
    ],
    ['TYPE_CHECKING = False\nif TYPE_CHECKING:\n    import a\n', ['- a true']],
    ['if TYPE_CHECKING:\n    import a\n', ['- a false']],
    ['import foo\nif foo.TYPE_CHECKING:\n    import a\n', ['- foo false', '- a false']],
    [
      'from mylib import TYPE_CHECKING\nif TYPE_CHECKING:\n    import a\n',
      ['mylib TYPE_CHECKING false', '- a false'],
    ],
    ['if debug:\n    import a\n', ['- a false']],
    ['try:\n    import a\nexcept ImportError:\n    import b\n', ['- a false', '- b false']],
    ['def f():\n    import a\n', ['- a false']],
  ])('%j', (code, expected) => {
    expect(scan(code)).toEqual(expected);
  });

  it('keeps the imports of a file with a 1100-branch elif chain', () => {
    const chain = Array.from(
      { length: 1100 },
      (_, index) => `elif x == ${String(index)}:\n    pass`,
    );

    expect(scan(`import os\nif x:\n    pass\n${chain.join('\n')}\n`)).toEqual(['- os false']);
  });

  it('keeps the imports of a file with a 2500-term expression', () => {
    expect(scan(`import os\ntotal = ${Array(2500).fill('1').join(' + ')}\n`)).toEqual([
      '- os false',
    ]);
  });
});
