import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mjs';
import { formatCommand } from './format-command.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const scratch = createScratch();

afterEach(scratch.cleanup);

const FORMATTED = 'x = 1\n';
const UNFORMATTED = 'x  =  1\n';

const PYPROJECT = [
  '[project]',
  'name = "demo"',
  'version = "1"',
  'requires-python = ">=3.9"',
  '[tool.ruff]',
  'extend-exclude = ["generated"]',
  '[tool.black]',
  'extend-exclude = "generated"',
  '',
].join('\n');

function checkFormat(formatter, files) {
  const root = scratch.write(scratch.directory(), files);
  const [program, ...args] = formatCommand({
    project: { formatter, targetVersion: 'py312' },
    conventions: {},
    policyRoot: root,
    projectRoot: root,
    reportRoot: scratch.directory(),
    exclude: [],
  });
  return spawnSync(program, args, { cwd: root, encoding: 'utf8' });
}

describe.skipIf(!enabled)('the formatters isolated from the project config', () => {
  it.each(['ruff', 'black'])(
    'keep ignoring what the project excludes, and still flag other files with %s',
    (formatter) => {
      const files = {
        'pyproject.toml': PYPROJECT,
        'a.py': FORMATTED,
        'generated/api.py': UNFORMATTED,
      };

      expect(checkFormat(formatter, files).status).toBe(0);
      expect(checkFormat(formatter, { ...files, 'b.py': UNFORMATTED }).status).toBe(1);
    },
  );
});
