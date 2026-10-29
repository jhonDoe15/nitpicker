export const debuggerMessage =
  '`debugger` statement is not allowed. If this is intended, add {"rule":"no-debugger",' +
  '"paths":["src/main/example.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
export const expectedDirtyFindings = [
  {
    tool: 'eslint-lint',
    rule: 'no-debugger',
    path: 'src/main/example.ts',
    identity:
      'message:`debugger` statement is not allowed|node:LastStatement|syntax:c101e41c622a39ff619763e2|occurrence:1',
    message: debuggerMessage,
    classification: 'enforceable',
    symbol: 'example',
    location: { line: 2, column: 3 },
    ratchet: {
      key: 'count:`debugger` statement is not allowed',
      value: 1,
      existingCodeOnly: true,
    },
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
