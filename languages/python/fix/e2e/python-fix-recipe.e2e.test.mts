import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../core/fix/test-support/fix-project.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { fix } = useFixProject();

const PROJECT = '[project]\nname = "demo"\nversion = "1"\nrequires-python = ">=3.9"\n';
const BASE = 'def load(path):\n    return path\n';
const CHANGED = `import logging

log = logging.getLogger(__name__)


def load(path):
    try:
        return open(path).read()
    except OSError as error:
        log.warning("cannot read %s: %s", path, error)
        raise RuntimeError("unreadable") from None
`;

describe.skipIf(!enabled)('nitpicker --fix runs a Python rule recipe', () => {
  it('fixes a logged exception that drops its traceback and lists it under Fixed findings', () => {
    const result = fix({
      committed: {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        'pyproject.toml': PROJECT,
        'app/load.py': BASE,
      },
      changed: { 'app/load.py': CHANGED },
    });

    expect(
      {
        exitCode: result.exitCode,
        report: fixReport(result.stdout),
        file: result.read('app/load.py'),
        base: result.baseSource('app/load.py'),
      },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: `Fixed files:
app/load.py
Fixed findings:
  app/load.py:10 python-rules/catch-log-without-exception (python-exc-info)
Fix notes:
  --fix could not verify the fixes: no analyzer reports the fixed rules
`,
      file: CHANGED.replace('path, error)', 'path, error, exc_info=True)'),
      base: BASE,
    });
  });
});
