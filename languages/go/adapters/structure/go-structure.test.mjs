import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { goStructureFindings } from './go-structure.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-structure-'));
const FILES = {
  'a/b/c/d/e/deep.go': 'package e\n',
  'internal/a/b/c/d/ok.go': 'package d\n',
  'shop/order.go': `package shop\n\n${'// line\n'.repeat(310)}`,
  'shop/doc.go': 'package shop\n',
};
for (const [file, text] of Object.entries(FILES)) {
  mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const report = {
  files: Object.keys(FILES).map((file) => ({
    path: file,
    package: 'x',
    test: false,
    generated: false,
  })),
  functions: [
    {
      file: 'shop/order.go',
      name: 'Order.Place',
      start: 3,
      end: 4,
      lines: 2,
      statements: 1,
      maxControlNesting: 3,
      parameters: 1,
      complexity: 4,
    },
  ],
  types: [
    {
      file: 'shop/order.go',
      name: 'Order',
      kind: 'struct',
      start: 3,
      end: 3,
      methods: 21,
      fields: 11,
    },
    {
      file: 'shop/order.go',
      name: 'Store',
      kind: 'interface',
      start: 3,
      end: 3,
      methods: 30,
      fields: 0,
    },
  ],
  tests: [],
};

const summary = (findings) => findings.map(({ rule, path: file }) => `${rule} ${file}`).sort();

describe('goStructureFindings', () => {
  it('holds functions, types, files and package depth to the shared limits', () => {
    expect(summary(goStructureFindings(report, root))).toEqual([
      'class-fields-limit shop/order.go',
      'class-methods-limit shop/order.go',
      'file-lines-limit shop/order.go',
      'folder-depth-limit a/b/c/d/e',
      'function-control-nesting-limit shop/order.go',
    ]);
  });

  it('names the type kind, Go-specific advice and the exception route in its messages', () => {
    const messages = goStructureFindings(report, root).map(({ message }) => message);
    expect(messages.toSorted()).toEqual([
      'File has 312 lines (limit 300). Split it into files by responsibility. If this is intended, add {"rule":"file-lines-limit","paths":["shop/order.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Order.Place nests control flow 3 deep (limit 2). Return early instead of nesting. An else-if chain counts as one level; return early, use a switch, or move what nests inside a branch into a helper function. If this is intended, add {"rule":"function-control-nesting-limit","paths":["shop/order.go"],"function":"Order.Place","reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Package is 5 levels below the module root (limit 4). Keep packages at most 4 levels below the module root (internal does not count): group by responsibility instead of nesting. If this is intended, add {"rule":"folder-depth-limit","paths":["a/b/c/d/e/**"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Struct Order has 11 fields (limit 10). Group related fields into a struct of their own and hold it as one field. If this is intended, add {"rule":"class-fields-limit","paths":["shop/order.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      'Struct Order has 21 methods (limit 20). Split it into types by responsibility. If this is intended, add {"rule":"class-methods-limit","paths":["shop/order.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('keeps the identity of a repeated init function when an earlier one is removed', () => {
    const init = (start, maxControlNesting) => ({
      ...report.functions[0],
      name: 'init',
      start,
      end: start + 1,
      maxControlNesting,
    });
    const identities = (functions) =>
      goStructureFindings({ ...report, types: [], functions }, root)
        .filter(({ rule }) => rule === 'function-control-nesting-limit')
        .map(({ identity }) => identity);
    expect(identities([init(3, 3)])).toEqual(identities([init(1, 0), init(3, 3)]));
  });

  it('takes the thresholds and exceptions from the policy', () => {
    const findings = goStructureFindings(report, root, {
      fileLimits: { classMethods: 25, folderDepth: 5, fileLines: 400 },
      exceptions: [{ rule: 'class-fields-limit', paths: ['shop/*.go'] }],
    });
    expect(summary(findings)).toEqual(['function-control-nesting-limit shop/order.go']);
  });
});
