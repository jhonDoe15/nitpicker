const STRUCTURE = 'structure';
const CLASS_A = 'A.java';
const CLASS_B = 'B.java';

export const SIZE_CASES = [
  [
    'plans a function that is too long with its limit and the blocks to move',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'function-lines-limit',
      path: 'src/a.ts',
      symbol: 'build(a)',
      location: { line: 1 },
      message: 'build has 9 lines; limit is 6. Split by responsibility.',
      allowedForm: 'Split by responsibility.',
    },
    {
      'src/a.ts':
        'export function build(a) {\n  const x = a + 1;\n  const y = x + 2;\n  const z = y + 3;\n\n  return [x, y, z]\n    .map(String)\n    .join(",");\n}',
    },
    {
      finding: { tool: STRUCTURE, rule: 'function-lines-limit', path: 'src/a.ts', line: 1 },
      kind: 'extract-function',
      target: { path: 'src/a.ts', symbol: 'build', startLine: 1, endLine: 9 },
      context: {
        metric: 'lines',
        value: 9,
        limit: 6,
        over: 3,
        blocks: [
          { startLine: 2, endLine: 4 },
          { startLine: 6, endLine: 8 },
        ],
      },
      steps: [
        'Read build (src/a.ts:1-9): 9 lines, limit 6.',
        'Move one or more of these blocks into functions of their own: lines 2-4, 6-8.',
        'Split by responsibility.',
        'Call each new function from build and keep its behavior.',
      ],
      doneWhen:
        'nitpicker reports no structure/function-lines-limit finding for build (src/a.ts:1-9).',
    },
  ],
  [
    'plans a function that nests too deep as a complexity reduction',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'function-control-nesting-limit',
      path: 'src/a.ts',
      location: { line: 1 },
      message: 'build nests control flow 4 deep (limit 2).',
    },
    {
      'src/a.ts':
        'export function build(a) {\n  const x = a + 1;\n  const y = x + 2;\n  const z = y + 3;\n\n  return [x, y, z]\n    .map(String)\n    .join(",");\n}',
    },
    {
      finding: {
        tool: STRUCTURE,
        rule: 'function-control-nesting-limit',
        path: 'src/a.ts',
        line: 1,
      },
      kind: 'reduce-complexity',
      target: { path: 'src/a.ts', startLine: 1, endLine: 9 },
      context: {
        metric: 'nesting',
        value: 4,
        limit: 2,
        over: 2,
        blocks: [
          { startLine: 2, endLine: 4 },
          { startLine: 6, endLine: 8 },
        ],
      },
      steps: [
        'Read src/a.ts:1-9: 4 levels, limit 2.',
        'Return early for the guard cases instead of nesting, and name a nested part.',
        'Move a deeply nested block into its own function: lines 2-4, 6-8.',
        'Keep the behavior: run the tests that cover it after each change.',
      ],
      doneWhen:
        'nitpicker reports no structure/function-control-nesting-limit finding for src/a.ts:1-9.',
    },
  ],
  [
    'plans a function with too many parameters from its signature',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'function-parameters-limit',
      path: 'a.ts',
      location: { line: 1 },
      message: 'f has 3 parameters; limit is 2.',
    },
    { 'a.ts': 'function f(a: number, b: Map<string, number>, c = () => 1) {\n}\n' },
    {
      finding: { tool: STRUCTURE, rule: 'function-parameters-limit', path: 'a.ts', line: 1 },
      kind: 'group-parameters',
      target: { path: 'a.ts', startLine: 1, endLine: 2 },
      context: {
        metric: 'parameters',
        value: 3,
        limit: 2,
        over: 1,
        parameters: ['a: number', 'b: Map<string, number>', 'c = () => 1'],
      },
      steps: [
        'Read a.ts:1-2: 3 parameters, limit 2.',
        'Group related parameters into one object and take that object instead.',
        'Pick the parameters that always travel together among: a: number, b: Map<string, number>, c = () => 1.',
        'Name the new type for what the values are, and update every caller.',
      ],
      doneWhen: 'nitpicker reports no structure/function-parameters-limit finding for a.ts:1-2.',
    },
  ],
  [
    'plans a file that is too long with its largest declarations',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'file-lines-limit',
      path: 'a.ts',
      message: 'a.ts has 12 lines; limit is 10.',
      ratchet: { key: 'lines', value: 12 },
    },
    {
      'a.ts':
        'export function build(a) {\n  const x = a + 1;\n  const y = x + 2;\n  const z = y + 3;\n\n  return [x, y, z]\n    .map(String)\n    .join(",");\n}\nexport const small = 1;\n',
    },
    {
      finding: { tool: STRUCTURE, rule: 'file-lines-limit', path: 'a.ts' },
      kind: 'split-file',
      target: { path: 'a.ts', startLine: 1, endLine: 11 },
      context: {
        lines: 12,
        limit: 10,
        declarations: [
          { name: 'build', startLine: 1, endLine: 9, lines: 9 },
          { name: 'small', startLine: 10, endLine: 10, lines: 1 },
        ],
      },
      steps: [
        'Read a.ts: 12 lines, limit 10.',
        'Move the largest declarations that belong together into a new file: build, small.',
        'Move cohesive declarations into a new file beside this one and import them.',
        'Create the file beside this one, or in a new subfolder when the folder is near its file limit.',
        'Update the imports of every user of what moved, and keep each file under its limit.',
      ],
      doneWhen: 'nitpicker reports no structure/file-lines-limit finding for a.ts:1-11.',
    },
  ],
  [
    'plans a class with too many methods from the members of its body',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'class-methods-limit',
      path: CLASS_A,
      location: { line: 1 },
      message: 'Class A has 2 methods; limit is 1.',
    },
    {
      'A.java':
        'public class A {\n  public int one() {\n    return 1;\n  }\n  public int two() {\n    return 2;\n  }\n}',
    },
    {
      finding: { tool: STRUCTURE, rule: 'class-methods-limit', path: CLASS_A, line: 1 },
      kind: 'split-file',
      target: { path: CLASS_A, startLine: 1, endLine: 8 },
      context: {
        metric: 'methods',
        value: 2,
        limit: 1,
        members: [
          { name: 'one', startLine: 2, endLine: 4, lines: 3 },
          { name: 'two', startLine: 5, endLine: 7, lines: 3 },
        ],
      },
      steps: [
        'Read the class at A.java:1: 2 methods, limit 1.',
        'Group the members that use the same fields, starting with: one, two.',
        'Move a group of related members into a new class and delegate to it.',
        'Move each group into its own class or file and keep the public behavior.',
      ],
      doneWhen: 'nitpicker reports no structure/class-methods-limit finding for A.java:1-8.',
    },
  ],
  [
    'plans a class with a deep hierarchy as a flatter one',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'inheritance-depth-limit',
      path: CLASS_B,
      location: { line: 1 },
      message: 'Class B extends 4 superclasses; limit is 2.',
      ratchet: { key: 'k', value: 4 },
    },
    { 'B.java': 'public class B extends A {\n}\n' },
    {
      finding: { tool: STRUCTURE, rule: 'inheritance-depth-limit', path: CLASS_B, line: 1 },
      kind: 'flatten-hierarchy',
      target: { path: CLASS_B, startLine: 1, endLine: 2 },
      context: { value: 4, limit: 2 },
      steps: [
        'Read the class at B.java:1: 4 superclasses, limit 2.',
        'Replace inheritance with a field that holds the shared behavior.',
        'Move behavior that only one subclass uses down into it, and compose the rest.',
      ],
      doneWhen: 'nitpicker reports no structure/inheritance-depth-limit finding for B.java:1-2.',
    },
  ],
  [
    'plans a crowded folder with its files',
    {
      identity: 'id',
      tool: STRUCTURE,
      rule: 'folder-files-limit',
      path: 'src/a',
      message: 'src/a has 3 files; limit is 2.',
    },
    { 'src/a/x.ts': '', 'src/a/y.ts': '', 'src/a/z.ts': '' },
    {
      finding: { tool: STRUCTURE, rule: 'folder-files-limit', path: 'src/a' },
      kind: 'move-module',
      target: { path: 'src/a', startLine: 1, endLine: 1 },
      context: { value: 3, limit: 2, files: ['x.ts', 'y.ts', 'z.ts'] },
      steps: [
        'Read src/a: 3 files or levels, limit 2.',
        'Group the files by what they are for.',
        'Move each group into a folder named for what it is.',
        'Update the imports of every moved file; the finding stops when the folder is within its limit.',
      ],
      doneWhen: 'nitpicker reports no structure/folder-files-limit finding for src/a:1.',
    },
  ],
];
