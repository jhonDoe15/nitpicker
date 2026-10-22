import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withHint } from '../../rules/rule-hints.mjs';
import { readDuplicateFindings, runDuplicates } from './python-duplicates.mjs';

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

function project(files, sourceRoots = ['src'], under = '.') {
  const projectRoot = path.join(temporaryRoot(), under);
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, relative)), { recursive: true });
    writeFileSync(path.join(projectRoot, relative), contents);
  }
  return { projectRoot, reportRoot: temporaryRoot(), project: { sourceRoots } };
}

function clonesOf(context) {
  runDuplicates(context);
  return readDuplicateFindings(context.reportRoot, context.projectRoot).filter(
    ({ rule }) => rule === 'duplicate-clone',
  );
}

describe('duplicates in Python sources', () => {
  it('reports a clone between two modules with project-relative paths', () => {
    const context = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE });

    expect(clonesOf(context)).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/app/a.py',
        identity: 'pair:src/app/a.py|src/app/b.py:fragment:8e33a9ff56a22a94c8efc96f:occurrence:1',
        message:
          'This code repeats src/app/b.py:1 (10 lines). Keep one copy and call it from both places. If the repetition is intended, add src/app/a.py or src/app/b.py to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
        ratchet: {
          key: 'pair:src/app/a.py|src/app/b.py:clone',
          value: 59,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/app/a.py', startLine: 1, endLine: 10 },
            { path: 'src/app/b.py', startLine: 1, endLine: 10 },
          ],
        },
      },
    ]);
  });

  it.each(['build', 'target'])(
    'reports the clone when the checkout sits under a folder named %s',
    (folder) => {
      const context = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE }, ['src'], folder);

      expect(clonesOf(context).map(({ identity }) => identity)).toEqual([
        'pair:src/app/a.py|src/app/b.py:fragment:8e33a9ff56a22a94c8efc96f:occurrence:1',
      ]);
    },
  );

  it('reports the sizes of a clone as metrics', () => {
    const context = project({ 'src/app/a.py': CLONE, 'src/app/b.py': CLONE });
    runDuplicates(context);

    const metrics = readDuplicateFindings(context.reportRoot, context.projectRoot)
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

  it('finds a clone between sibling top-level packages', () => {
    const context = project(
      {
        'billing/__init__.py': '',
        'billing/calc.py': CLONE,
        'shipping/__init__.py': '',
        'shipping/calc.py': CLONE,
      },
      ['billing', 'shipping'],
    );

    expect(
      clonesOf(context).map(({ path: file, message }) => [file, message.slice(0, 40)]),
    ).toEqual([['billing/calc.py', 'This code repeats shipping/calc.py:1 (10']]);
  });

  it('names a clone between two source roots with project-relative paths', () => {
    const context = project({ 'src/calc.py': CLONE, 'lib/calc.py': CLONE }, ['src', 'lib']);

    expect(clonesOf(context).map(({ path: file }) => file)).toEqual(['lib/calc.py']);
  });

  it('does not let the project own jscpd configuration decide the result', () => {
    const context = project({
      'src/app/a.py': CLONE,
      'src/app/b.py': CLONE,
      '.jscpd.json': JSON.stringify({ threshold: 1, minTokens: 5000, ignore: ['**/a.py'] }),
    });

    expect(clonesOf(context).map(({ path: file }) => file)).toEqual(['src/app/a.py']);
  });

  it('does not report clones that are only imports or re-exports', () => {
    const header = [
      'import os',
      'import sys',
      'import json',
      'from typing import (',
      '    Any,',
      '    Dict,',
      '    List,',
      ')',
      'from app.models import first_model, second_model, third_model, fourth_model',
      '',
      '__all__ = [',
      '    "first_model",',
      '    "second_model",',
      ']',
      '',
    ].join('\n');
    const context = project({ 'src/app/p1/__init__.py': header, 'src/app/p2/__init__.py': header });

    expect(clonesOf(context)).toEqual([]);
  });

  it('still reports a clone that carries code after the imports', () => {
    const header = 'import os\nimport sys\nimport json\nimport logging\n\n\n';
    const context = project({
      'src/app/a.py': `${header}${CLONE}`,
      'src/app/b.py': `${header}${CLONE}`,
    });

    expect(clonesOf(context)).toHaveLength(1);
  });

  it('ignores migrations', () => {
    const context = project({
      'src/app/migrations/0001_initial.py': CLONE,
      'src/app/migrations/0002_next.py': CLONE,
    });

    expect(clonesOf(context)).toEqual([]);
  });

  it('analyses a package named like a skipped folder when the project lists its own folders', () => {
    const files = {
      'src/app/build/a.py': CLONE,
      'src/app/build/b.py': CLONE,
      'src/app/dist/c.py': CLONE,
      'src/app/dist/d.py': CLONE,
    };

    expect(clonesOf(project(files))).toEqual([]);
    expect(
      clonesOf({ ...project(files), duplicateSkippedFolders: ['dist'] }).map(
        ({ path: file }) => file,
      ),
    ).toEqual(['src/app/build/a.py']);
  });

  it('ignores documentation, examples and scripts when the project is its own root', () => {
    const context = project({ 'examples/demo.py': CLONE, 'scripts/demo.py': CLONE }, ['.']);

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

function renamedFunction({ fn, items, total, item, cap, scale, bonus }) {
  return [
    `def ${fn}(${items}, rate):`,
    `    ${total} = 0`,
    `    for ${item} in ${items}:`,
    `        if ${item}.price > ${bonus} and ${item}.quantity > ${bonus}:`,
    `            ${total} += ${item}.price * ${item}.quantity * rate`,
    `        elif ${item}.price < ${bonus}:`,
    `            ${total} -= abs(${item}.price) * ${item}.quantity`,
    `        else:`,
    `            ${total} += ${scale}`,
    `    if ${total} > ${cap}:`,
    `        ${total} = ${total} - ${scale}`,
    `    if ${total} < ${bonus} and rate > ${bonus}:`,
    `        ${total} = ${bonus}`,
    `    elif ${total} > ${cap} * rate:`,
    `        ${total} = ${cap}`,
    `    rounded = round(${total} * ${scale}) / ${scale}`,
    `    return rounded if rounded > ${cap} else ${total}`,
    '',
  ].join('\n');
}

const INVOICE = {
  fn: 'invoice_total',
  items: 'lines',
  total: 'subtotal',
  item: 'line',
  cap: 1000,
  scale: 100,
  bonus: 0,
};
const PARCEL = {
  fn: 'weigh_boxes',
  items: 'boxes',
  total: 'accumulated',
  item: 'box',
  cap: 5000,
  scale: 10,
  bonus: 1,
};

describe('duplicates whose names and literals were renamed', () => {
  it('reports a copied function with every name and literal changed, once', () => {
    const context = project({
      'src/app/invoice.py': renamedFunction(INVOICE),
      'src/app/parcel.py': renamedFunction(PARCEL),
    });

    const clones = clonesOf(context);

    expect(clones).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/app/invoice.py',
        identity:
          'renamed:pair:src/app/invoice.py|src/app/parcel.py:fragment:0c4f7b418409de01cec2e906:occurrence:1',
        message:
          'This code repeats src/app/parcel.py:1 (17 lines). Keep one copy and call it from both places. If the repetition is intended, add src/app/invoice.py or src/app/parcel.py to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
        ratchet: {
          key: 'pair:src/app/invoice.py|src/app/parcel.py:clone',
          value: 117,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/app/invoice.py', startLine: 1, endLine: 17 },
            { path: 'src/app/parcel.py', startLine: 1, endLine: 17 },
          ],
        },
      },
    ]);
  });

  it('ends the message with the python.exceptions route', () => {
    const context = project({
      'src/app/invoice.py': renamedFunction(INVOICE),
      'src/app/parcel.py': renamedFunction(PARCEL),
    });

    expect(withHint(clonesOf(context)[0]).message).toBe(
      'This code repeats src/app/parcel.py:1 (17 lines). Keep one copy and call it from both places. ' +
        'If the repetition is intended, add src/app/invoice.py or src/app/parcel.py to "exclude" in nitpicker.config.json. ' +
        'To allow it for some paths, add a "python.exceptions" entry for duplicate-clone in ' +
        'nitpicker.config.json.',
    );
  });

  it('keeps the identity when a name or a literal in a copy changes', () => {
    const before = project({
      'src/app/invoice.py': renamedFunction(INVOICE),
      'src/app/parcel.py': renamedFunction(PARCEL),
    });
    const after = project({
      'src/app/invoice.py': renamedFunction(INVOICE),
      'src/app/parcel.py': renamedFunction({ ...PARCEL, total: 'running', cap: 77 }),
    });

    expect(clonesOf(after)[0].identity).toBe(clonesOf(before)[0].identity);
  });

  it('stays quiet for short functions, imports, tables, fields and generated files', () => {
    const imports = (names) =>
      `${names.map((name) => `from app.${name} import ${name}_one, ${name}_two, ${name}_three`).join('\n')}\n`;
    const table = (key) =>
      `ROWS = [\n${Array.from({ length: 30 }, (_, index) => `    ("${key}${index}", ${index * 3}, True),`).join('\n')}\n]\n`;
    const fields = (key) =>
      `@dataclass\nclass Record:\n${Array.from({ length: 20 }, (_, index) => `    ${key}${index}: str = ""`).join('\n')}\n`;
    const generated = (values) => `# @generated\n${renamedFunction(values)}`;
    const context = project({
      'src/app/short_a.py': 'def area(w, h):\n    return w * h\n',
      'src/app/short_b.py': 'def size(a, b):\n    return a * b\n',
      'src/app/imports_a.py': imports([
        'alpha',
        'beta',
        'gamma',
        'delta',
        'epsilon',
        'zeta',
        'eta',
      ]),
      'src/app/imports_b.py': imports(['one', 'two', 'three', 'four', 'five', 'six', 'seven']),
      'src/app/table_a.py': table('left'),
      'src/app/table_b.py': table('right'),
      'src/app/fields_a.py': fields('left'),
      'src/app/fields_b.py': fields('right'),
      'src/app/generated_a.py': generated(INVOICE),
      'src/app/generated_b.py': generated(PARCEL),
    });

    expect(clonesOf(context)).toEqual([]);
  });
});

const SHAPE_NAMES = (
  'id name email phone street city zip country role plan bio score level owner locale avatar ' +
  'status created updated timezone'
).split(' ');
const OTHER_NAMES = (
  'code total tax note carrier weight items paid buyer method coupon refund channel house ' +
  'invoice placed shipped tracking discount currency'
).split(' ');

const IRREGULAR = '3141592653589793238462643383279502884197';

const shapes = {
  mapper: (names) =>
    `def to_dto(source):\n    return Dto(\n${names.map((name) => `        ${name}=source.${name},`).join('\n')}\n    )\n`,
  enumeration: (names) => {
    const values = ['"x"', '1', 'auto()'];
    const members = [...names, ...names.map((name) => `${name}_old`)].map(
      (name, index) => `    ${name.toUpperCase()} = ${values[Number(IRREGULAR[index]) % 3]}`,
    );
    return `from enum import Enum, auto\n\n\nclass Kind(Enum):\n${members.join('\n')}\n`;
  },
  enumMap: (names) =>
    `NAMES = {\n${names.map((name) => `    Status.${name.toUpperCase()}: "${name}",`).join('\n')}\n}\n`,
  arguments: (names) => {
    const calls = names.map(
      (name, index) =>
        `    parser.add_argument("--${name}", type=int, default=${String(index)}, help="${name}")`,
    );
    return `def parse():\n    parser = argparse.ArgumentParser()\n${calls.join('\n')}\n    return parser.parse_args()\n`;
  },
};

describe('code that only shares a shape with other code', () => {
  it.each(Object.keys(shapes))('stays quiet for a renamed %s', (shape) => {
    const context = project({
      'src/app/left.py': shapes[shape](SHAPE_NAMES),
      'src/app/right.py': shapes[shape](OTHER_NAMES),
    });

    expect(clonesOf(context)).toEqual([]);
  });
});
