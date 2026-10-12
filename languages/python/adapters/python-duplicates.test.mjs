import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDuplicateFindings } from '../../java/adapters/java-duplicates.mjs';
import { runDuplicates } from './python-duplicates.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-duplicates-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const CLONE = [
  'def order_total(lines, discount):',
  '    total = 0',
  '    for line in lines:',
  '        if line.price > 0 and line.quantity > 0:',
  '            total += line.price * line.quantity',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');

function project(files, sourceRoots = ['src']) {
  const projectRoot = temporaryRoot();
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    writeFileSync(path.join(projectRoot, relative), contents);
  }
  return { projectRoot, reportRoot: temporaryRoot(), project: { sourceRoots } };
}

function clonesOf(context) {
  runDuplicates(context);
  return readDuplicateFindings(context.reportRoot).filter(({ rule }) => rule === 'duplicate-clone');
}

describe('duplicates in Python sources', () => {
  it('reports a clone between two modules with project-relative paths', () => {
    const context = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE });

    expect(clonesOf(context)).toEqual([
      expect.objectContaining({
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/app/a.py',
        classification: 'enforceable',
        message: expect.stringContaining('This code repeats src/app/b.py'),
      }),
    ]);
  });

  it('reports the sizes of a clone as metrics', () => {
    const context = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE });
    runDuplicates(context);

    const metrics = readDuplicateFindings(context.reportRoot)
      .filter(({ rule }) => rule === 'duplicate-clone-size')
      .map(({ metric }) => metric.name);

    expect(metrics).toEqual(['lines', 'tokens']);
  });

  it('keeps the identity when code moves within a file', () => {
    const before = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE });
    const after = project({
      'src/app/a.py': `import os\n\n\n${CLONE}`,
      'src/app/b.py': CLONE,
    });

    expect(clonesOf(after)[0].identity).toBe(clonesOf(before)[0].identity);
  });

  it('measures a project whose source root is the project itself', () => {
    const context = project({ 'app/a.py': CLONE, 'app/b.py': CLONE }, ['.']);

    expect(clonesOf(context).map(({ path: file }) => file)).toEqual(['app/a.py']);
  });

  it('ignores tests, hidden directories and test files', () => {
    const context = project(
      {
        'app/a.py': CLONE,
        'app/tests/test_a.py': CLONE,
        'app/test_b.py': CLONE,
        'app/b_test.py': CLONE,
        'app/conftest.py': CLONE,
        'app/.venv/lib/c.py': CLONE,
        'app/__pycache__/d.py': CLONE,
      },
      ['.'],
    );

    expect(clonesOf(context)).toEqual([]);
  });

  it('writes an empty report when no source root exists', () => {
    const context = project({ 'other/a.py': CLONE, 'other/b.py': CLONE });

    expect(clonesOf(context)).toEqual([]);
  });

  it('names the step when jscpd cannot run', () => {
    const context = project({ 'src/a.py': CLONE });
    const blocker = path.join(context.reportRoot, 'blocker');
    writeFileSync(blocker, '');

    expect(() => {
      runDuplicates({ ...context, reportRoot: blocker });
    }).toThrow(expect.objectContaining({ rule: 'duplicates-failed' }));
  });
});
