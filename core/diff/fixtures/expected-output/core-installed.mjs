import { expect } from 'vitest';
export function expectedOutput254_35() {
  return [
    {
      tool: 'eslint-lint',
      rule: 'no-debugger',
      path: 'src/main/example.ts',
      identity:
        'message:unexpected|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
      message: "Unexpected 'debugger' statement.",
      classification: 'enforceable',
      symbol: 'example',
      location: { line: 2, column: 3 },
      ratchet: { key: 'count:unexpected', value: 1, existingCodeOnly: true },
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:3021261b8c9abc3d63b74d13',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 1, endLine: 1 },
    },
    {
      tool: 'prettier-format',
      rule: 'prettier/prettier',
      path: 'src/main/example.ts',
      identity: 'format-diff:92772ea69de4f061a708c457',
      message: 'Format these lines with Prettier',
      classification: 'enforceable',
      location: { line: 3, endLine: 3 },
    },
  ];
}

export function expectedOutput264_30({ root }) {
  return `Base: main (argument)

Quality gate summary
✖ 3 new enforceable violations
  eslint-lint/no-debugger src/main/example.ts:2
    Unexpected 'debugger' statement.
  prettier-format/prettier/prettier src/main/example.ts (2 times, lines 1, 3)
    Format these lines with Prettier
Full diagnostics: ${root}/reports/dirty/report.txt
nitpicker: base 2 analyzers cached
nitpicker: head: running 2 analyzers
`;
}

export function expectedOutput310_33() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 2\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\nprettier-format: total=2 enforceable=2 descriptive=0\n\nEnforceable findings:\nprettier-format/prettier/prettier src/main/example.ts:1 Format these lines with Prettier\nprettier-format/prettier/prettier src/main/example.ts:3 Format these lines with Prettier\nnitpicker: head: running 1 analyzer\n';
}
