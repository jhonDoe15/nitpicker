import { describe, expect, it } from 'vitest';
import { messageLines } from './message-lines.mts';

describe('message lines', () => {
  it('joins lines split across chunks and skips blank lines', () => {
    const lines: string[] = [];
    const onChunk = messageLines((line) => lines.push(line));

    onChunk('{"id":1}\n\n  \n{"id"');
    onChunk(':2}\n');

    expect(lines).toEqual(['{"id":1}', '{"id":2}']);
  });
});
