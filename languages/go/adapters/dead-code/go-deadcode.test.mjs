import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { unreachableFindings } from './go-deadcode.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-deadcode-'));
const FILES = {
  'internal/store/store.go':
    'package store\n\nfunc unused() {}\n\nfunc OnlyTests() {}\n\nfunc Windows() {}\n\n//export hook\nfunc hook() {}\n',
  'internal/store/store_windows.go':
    'package store\n\nfunc init() { Windows() }\n\nfunc winOnly() {}\n',
  'api/api.go':
    'package api\n\nfunc Public() {}\n\nfunc private() {}\n\nfunc unusedEverywhere() {}\n',
};
for (const [file, text] of Object.entries(FILES)) {
  mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const REPORT = {
  files: [
    { path: 'internal/store/store.go', package: 'store', test: false, constrained: false },
    { path: 'internal/store/store_windows.go', package: 'store', test: false, constrained: true },
    { path: 'api/api.go', package: 'api', test: false, constrained: false },
  ],
  definitions: [
    { file: 'internal/store/store.go', name: 'unused', entry: false },
    { file: 'internal/store/store.go', name: 'hook', entry: true },
  ],
};

function dead(file, line, name) {
  return { Name: name, Position: { File: file, Line: line, Col: 6 } };
}

const DEADCODE = [
  {
    Path: 'example.com/shop/internal/store',
    Funcs: [
      dead('internal/store/store.go', 3, 'unused'),
      dead('internal/store/store.go', 5, 'OnlyTests'),
      dead('internal/store/store.go', 7, 'Windows'),
      dead('internal/store/store.go', 10, 'hook'),
      dead('internal/store/store_windows.go', 5, 'winOnly'),
    ],
  },
  {
    Path: 'example.com/shop/api',
    Funcs: [
      dead('api/api.go', 3, 'Public'),
      dead('api/api.go', 5, 'private'),
      dead('api/api.go', 7, 'unusedEverywhere'),
    ],
  },
];

describe('deadcode findings', () => {
  it('keeps functions no build reaches, that other modules and cgo cannot call', () => {
    const findings = unreachableFindings(root, DEADCODE, {
      report: REPORT,
      module: 'example.com/shop',
      facts: {
        imports: [
          {
            from: 'internal/store/store_windows.go',
            to: 'internal/store/store.go',
            names: [{ name: 'Windows' }],
          },
        ],
      },
      testOnly: [{ path: 'internal/store/store.go', symbol: 'OnlyTests' }],
      unused: [{ path: 'api/api.go', location: { line: 7 } }],
    });
    expect(
      findings.map(({ rule, path: file, location, message }) => [
        rule,
        file,
        location.line,
        message,
      ]),
    ).toEqual([
      [
        'unreachable-func',
        'internal/store/store.go',
        3,
        'unused is never reached from a main package of this module (deadcode; calls from tests do not count). Delete it, or call it from production code.',
      ],
      [
        'unreachable-func',
        'api/api.go',
        5,
        'private is never reached from a main package of this module (deadcode; calls from tests do not count). Delete it, or call it from production code.',
      ],
    ]);
  });
});
