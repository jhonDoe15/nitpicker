import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { command } from './consumer.mjs';

describe('command', () => {
  it('records the status of a process that exits without reading its input', () => {
    const result = command(tmpdir(), 'sh', ['-c', 'exit 3'], {
      input: 'x'.repeat(1024 * 1024),
    });

    expect(result).toMatchObject({ status: 3, timedOut: false });
  });

  it('still throws when the executable cannot be started', () => {
    expect(() => command(tmpdir(), 'nitpicker-no-such-executable', [])).toThrow(/ENOENT/);
  });
});
