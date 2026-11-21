import {
  inFile,
  pythonLines,
  ruleLine,
  useRuleScripts,
} from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const WORK_BEFORE_EXIT = ruleLine('work-before-early-exit');
const workBeforeExit = useRuleScripts('work-before-early-exit', { enabled });

workBeforeExit.describeRules('work-before-early-exit', () => {
  workBeforeExit.itOutcomes('flags pure costly work right before an early exit', [
    [
      'list comprehension before raise',
      pythonLines(
        'def collect(rows, active):',
        '    due = [row for row in rows if row.due]',
        '    if not active:',
        '        raise ValueError("inactive")',
        '    return due',
      ),
      [WORK_BEFORE_EXIT(2, 'due')],
    ],
    [
      'dict copy before return None',
      pythonLines(
        'def build(source, options):',
        '    index = dict(source.items())',
        '    if not options.enabled:',
        '        return None',
        '    return index',
      ),
      [WORK_BEFORE_EXIT(2, 'index')],
    ],
    [
      'set construction before return empty list',
      pythonLines(
        'def intersect(rows, other, active):',
        '    seen = set(other)',
        '    if not active:',
        '        return []',
        '    return [row for row in rows if row in seen]',
      ),
      [WORK_BEFORE_EXIT(2, 'seen')],
    ],
    [
      'sorted with pure lambda before continue',
      pythonLines(
        'def process(batches):',
        '    out = []',
        '    for batch in batches:',
        '        ordered = sorted(batch.rows, key=lambda r: r.score)',
        '        if not batch.active:',
        '            continue',
        '        out.append(ordered)',
        '    return out',
      ),
      [WORK_BEFORE_EXIT(4, 'ordered')],
    ],
  ]);

  workBeforeExit.itOutcomes('allows guards, cheap values, impure calls, and used locals', [
    [
      'json.loads before exit',
      pythonLines(
        'import json',
        'def parse(text, enabled):',
        '    parsed = json.loads(text)',
        '    if not enabled:',
        '        return []',
        '    return parsed',
      ),
      [],
    ],
    [
      'file read before exit',
      pythonLines(
        'def load(path, enabled):',
        '    text = path.read_text(encoding="utf-8")',
        '    if not enabled:',
        '        return ""',
        '    return text',
      ),
      [],
    ],
    [
      'nested helper called in guard reads the variable',
      pythonLines(
        'def process(items, bad):',
        '    def cleanup():',
        '        return len(rows)',
        '    rows = [x + 1 for x in items]',
        '    if bad:',
        '        cleanup()',
        '        return []',
        '    return rows',
      ),
      [],
    ],
    [
      'branching init with conditional expression',
      pythonLines(
        'def find(rows, key):',
        '    found = None if key is None else [r for r in rows if r == key]',
        '    if key is None:',
        '        return []',
        '    return found',
      ),
      [],
    ],
    [
      'branching init with and',
      pythonLines(
        'def check(rows, ready):',
        '    found = ready and any(r > 1 for r in rows)',
        '    if not ready:',
        '        return False',
        '    return found',
      ),
      [],
    ],
    [
      'guard before work',
      pythonLines(
        'def collect(rows, active):',
        '    if not active:',
        '        return []',
        '    return [row for row in rows if row.due]',
      ),
      [],
    ],
    [
      'guard reads variable',
      pythonLines(
        'def collect(rows):',
        '    due = [row for row in rows if row.due]',
        '    if not due:',
        '        return []',
        '    return due',
      ),
      [],
    ],
    [
      'cheap len call',
      pythonLines(
        'def count(rows, active):',
        '    total = len(rows)',
        '    if not active:',
        '        return 0',
        '    return total',
      ),
      [],
    ],
    [
      'impure function inside comprehension',
      pythonLines(
        'def collect(rows, active):',
        '    doubled = [audit(row) for row in rows]',
        '    if not active:',
        '        return []',
        '    return doubled',
      ),
      [],
    ],
    [
      'unsettled guard condition',
      pythonLines(
        'def collect(rows):',
        '    doubled = [row * 2 for row in rows]',
        '    if not check():',
        '        return []',
        '    return doubled',
      ),
      [],
    ],
    [
      'guard with else branch',
      pythonLines(
        'def collect(rows, active):',
        '    doubled = [row * 2 for row in rows]',
        '    if not active:',
        '        return []',
        '    else:',
        '        return doubled',
      ),
      [],
    ],
    [
      'in-place sort is not pure',
      pythonLines(
        'def order(rows, active):',
        '    ordered = rows.sort()',
        '    if not active:',
        '        return None',
        '    return ordered',
      ),
      [],
    ],
    [
      'statement between assignment and guard',
      pythonLines(
        'def collect(rows, active, log):',
        '    doubled = [row * 2 for row in rows]',
        '    log(active)',
        '    if not active:',
        '        return []',
        '    return doubled',
      ),
      [],
    ],
    [
      'unused variable',
      pythonLines(
        'def collect(rows, active):',
        '    doubled = [row * 2 for row in rows]',
        '    if not active:',
        '        return []',
        '    return []',
      ),
      [],
    ],
    [
      'reassigned variable',
      pythonLines(
        'def collect(rows, active):',
        '    doubled = [row * 2 for row in rows]',
        '    if not active:',
        '        return []',
        '    doubled = []',
        '    return doubled',
      ),
      [],
    ],
    [
      'test file skipped',
      inFile(
        'tests/test_guards.py',
        pythonLines(
          'def test_collect(rows, active):',
          '    due = [row for row in rows if row.due]',
          '    if not active:',
          '        return []',
          '    return due',
        ),
      ),
      [],
    ],
  ]);
});
