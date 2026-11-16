const DUPLICATES = 'duplicates';
const CLONE_RULE = 'duplicate-clone';
const COUPLING = 'coupling';
const CYCLE_FILE = 'src/a/x.ts';
const SHARED_FILE = 'src/shared/a.ts';
const LAYOUT_FILE = 'src/A.java';

export const DESIGN_CASES = [
  [
    'plans a duplicate with both copies from the ratchet',
    {
      identity: 'id',
      tool: DUPLICATES,
      rule: CLONE_RULE,
      path: 'a.ts',
      location: { line: 5 },
      message: 'This code repeats b.ts:10 (4 lines). Keep one copy and call it from both places.',
      ratchet: {
        key: 'pair',
        value: 1,
        mustKeepUnchangedLines: [
          { path: 'a.ts', startLine: 5, endLine: 8 },
          { path: 'b.ts', startLine: 10, endLine: 13 },
        ],
      },
    },
    {},
    {
      finding: { tool: DUPLICATES, rule: CLONE_RULE, path: 'a.ts', line: 5 },
      kind: 'remove-duplicate',
      target: { path: 'a.ts', startLine: 5, endLine: 8 },
      context: {
        copies: [
          { path: 'a.ts', startLine: 5, endLine: 8 },
          { path: 'b.ts', startLine: 10, endLine: 13 },
        ],
        lines: 4,
        sameFile: false,
      },
      steps: [
        'Compare the copies: a.ts:5-8 and b.ts:10-13.',
        'Extract the shared code into one function in one of the two files, or in a module both import.',
        'Make both places call it; pass what differs (names, literals) as parameters.',
        'Keep one copy and call it from both places.',
        'Keep the behavior of both callers: run their tests.',
      ],
      doneWhen: 'nitpicker reports no duplicates/duplicate-clone finding for a.ts:5-8.',
    },
  ],
  [
    'plans a duplicate within one file from the message',
    {
      identity: 'id',
      tool: DUPLICATES,
      rule: CLONE_RULE,
      path: 'a.ts',
      location: { line: 5 },
      message: 'This code repeats a.ts:20 (3 lines). Keep one copy.',
    },
    {},
    {
      finding: { tool: DUPLICATES, rule: CLONE_RULE, path: 'a.ts', line: 5 },
      kind: 'remove-duplicate',
      target: { path: 'a.ts', startLine: 5, endLine: 7 },
      context: {
        copies: [
          { path: 'a.ts', startLine: 5, endLine: 7 },
          { path: 'a.ts', startLine: 20, endLine: 22 },
        ],
        lines: 3,
        sameFile: true,
      },
      steps: [
        'Compare the copies: a.ts:5-7 and a.ts:20-22.',
        'Extract the shared code into one function in this file.',
        'Make both places call it; pass what differs (names, literals) as parameters.',
        'Keep one copy and call it from both places.',
        'Keep the behavior of both callers: run their tests.',
      ],
      doneWhen: 'nitpicker reports no duplicates/duplicate-clone finding for a.ts:5-7.',
    },
  ],
  [
    'plans the other copy of an edited sibling',
    {
      identity: 'id',
      tool: 'structure',
      rule: 'sibling-copy-edit',
      path: 'a.ts',
      location: { line: 2 },
      message: 'f is edited here but not in b.ts and c.ts, where it has almost the same code.',
    },
    {},
    {
      finding: { tool: 'structure', rule: 'sibling-copy-edit', path: 'a.ts', line: 2 },
      kind: 'remove-duplicate',
      target: { path: 'a.ts', startLine: 2, endLine: 2 },
      context: { others: ['b.ts', 'c.ts'] },
      steps: [
        'Compare it with the copy in b.ts, c.ts.',
        'Edit it there too, or merge the copies.',
        'Prefer merging the copies into one shared function.',
      ],
      doneWhen: 'nitpicker reports no structure/sibling-copy-edit finding for a.ts:2.',
    },
  ],
  [
    'plans a dependency that points the wrong way from the edge in its identity',
    {
      identity: 'package-edge:app.a->app.b',
      tool: COUPLING,
      rule: 'stability-direction',
      path: 'app/a',
      message: 'app.a depends on less stable package app.b',
    },
    {},
    {
      finding: { tool: COUPLING, rule: 'stability-direction', path: 'app/a' },
      kind: 'invert-dependency',
      target: { path: 'app/a', startLine: 1, endLine: 1 },
      context: { edge: { from: 'app.a', to: 'app.b' } },
      steps: [
        'Read the dependency app.a -> app.b.',
        'Depend on an abstraction in a more stable package, or move the dependency inward.',
        'Update the imports of every file that used the old path, and run the tests.',
      ],
      doneWhen: 'nitpicker reports no coupling/stability-direction finding for app/a:1.',
    },
  ],
  [
    'plans an import that breaks a rule from the import line and the cycle in the message',
    {
      identity: 'id',
      tool: COUPLING,
      rule: 'feature-cycle',
      path: CYCLE_FILE,
      location: { line: 2 },
      message: 'Keep one-way: x imports b (cycle: a -> b -> a).',
    },
    { 'src/a/x.ts': "import 'x';\nimport { y } from '../b/y.js';\n" },
    {
      finding: { tool: COUPLING, rule: 'feature-cycle', path: CYCLE_FILE, line: 2 },
      kind: 'invert-dependency',
      target: { path: CYCLE_FILE, startLine: 2, endLine: 2 },
      context: {
        edge: {
          from: CYCLE_FILE,
          line: 2,
          specifier: '../b/y.js',
          source: "import { y } from '../b/y.js';",
        },
        cycle: ['a', 'b', 'a'],
      },
      steps: [
        'Read the dependency src/a/x.ts -> ../b/y.js.',
        'It closes the cycle a -> b -> a; cut it once.',
        'Move what both need to a shared root, or invert this import behind an interface.',
        'Update the imports of every file that used the old path, and run the tests.',
      ],
      doneWhen: 'nitpicker reports no coupling/feature-cycle finding for src/a/x.ts:2.',
    },
  ],
  [
    'plans a shared module that one feature uses as a move',
    {
      identity: 'id',
      tool: COUPLING,
      rule: 'shared-used-by-one-feature',
      path: SHARED_FILE,
      message: 'src/shared/a.ts is used only by feature f. Move it into src/f.',
      allowedForm: 'Move it into src/f.',
    },
    {},
    {
      finding: { tool: COUPLING, rule: 'shared-used-by-one-feature', path: SHARED_FILE },
      kind: 'move-module',
      target: { path: SHARED_FILE, startLine: 1, endLine: 1 },
      context: {},
      steps: [
        'Read src/shared/a.ts.',
        'Move it into src/f.',
        'Move the file with `git mv`, then update its imports and the imports of its users.',
      ],
      doneWhen:
        'nitpicker reports no coupling/shared-used-by-one-feature finding for src/shared/a.ts:1.',
    },
  ],
  [
    'plans a test without production code with the production file it is about',
    {
      identity: 'id',
      tool: 'test-runtime',
      rule: 'no-production-runtime',
      path: 'src/a.test.ts',
      message: 'No production code runs.',
    },
    { 'src/a.test.ts': "import { expect } from 'vitest';\n", 'src/a.ts': '' },
    {
      finding: { tool: 'test-runtime', rule: 'no-production-runtime', path: 'src/a.test.ts' },
      kind: 'exercise-production-code',
      target: { path: 'src/a.test.ts', startLine: 1, endLine: 1 },
      context: { subject: 'src/a.ts', imports: ['vitest'] },
      steps: [
        'Import and call the code the test is about: src/a.ts.',
        'Import and run the production code the test is about.',
        'Assert what the production code returns or does, so the test fails when it breaks.',
      ],
      doneWhen:
        'nitpicker reports no test-runtime/no-production-runtime finding for src/a.test.ts:1.',
    },
  ],
  [
    'plans a nitpicker lint rule from its kind and allowed form',
    {
      identity: 'id',
      tool: 'eslint-lint',
      rule: 'nitpicker/no-handwritten-boundary-guard',
      path: 'src/adapter.ts',
      location: { line: 3 },
      message: 'Parse it. If this is intended, add {} to "exceptions" in nitpicker.config.json.',
    },
    { 'src/adapter.ts': 'a\nb\nif (typeof x === "string") {}\n' },
    {
      finding: {
        tool: 'eslint-lint',
        rule: 'nitpicker/no-handwritten-boundary-guard',
        path: 'src/adapter.ts',
        line: 3,
      },
      kind: 'parse-at-boundary',
      target: { path: 'src/adapter.ts', startLine: 3, endLine: 3 },
      context: { source: 'if (typeof x === "string") {}' },
      steps: [
        'Read src/adapter.ts:3.',
        'Parse it.',
        'Parse the data once at the boundary into a typed value, and pass that value on instead of the raw one.',
      ],
      doneWhen:
        'nitpicker reports no eslint-lint/nitpicker/no-handwritten-boundary-guard finding for src/adapter.ts:3.',
    },
  ],
  [
    'plans an architecture rule as a move',
    {
      identity: 'id',
      tool: 'archunit',
      rule: 'spring-layout',
      path: LAYOUT_FILE,
      message: 'A sits in the root package.',
    },
    {},
    {
      finding: { tool: 'archunit', rule: 'spring-layout', path: LAYOUT_FILE },
      kind: 'move-module',
      target: { path: LAYOUT_FILE, startLine: 1, endLine: 1 },
      context: {},
      steps: [
        'Read src/A.java:1.',
        'A sits in the root package.',
        'Move it to where the rule allows it, and update its imports and its users.',
      ],
      doneWhen: 'nitpicker reports no archunit/spring-layout finding for src/A.java:1.',
    },
  ],
];
