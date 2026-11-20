import { describe, expect, it } from 'vitest';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { reportedPositions } from './message-positions.mts';

const ts = typescriptApi();
const source = ts.createSourceFile(
  'a.ts',
  'const first = 1;\n  // note\nconst last = 2;\n',
  ts.ScriptTarget.Latest,
);

describe('positions of an ESLint message in the source file', () => {
  it('reads the start and the end as offsets', () => {
    const message = { line: 2, column: 3, endLine: 2, endColumn: 10 };

    expect(reportedPositions(message, 'message', source)).toEqual({
      line: 2,
      column: 3,
      sourcePosition: 19,
      endPosition: 26,
    });
  });

  it('stops at the end of the line when a column lies past it', () => {
    const message = { line: 2, column: 3, endLine: 2, endColumn: 40 };

    expect(reportedPositions(message, 'message', source).endPosition).toBe(26);
  });
});
