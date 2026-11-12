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

  it('captures output larger than the default 1 MiB buffer', () => {
    const result = command(tmpdir(), 'sh', ['-c', 'head -c 3000000 /dev/zero | tr "\\0" x']);

    expect(result.status).toBe(0);
    expect(result.output.length).toBe(3_000_000);
  });

  it('still throws when the executable cannot be started', () => {
    expect(() => command(tmpdir(), 'nitpicker-no-such-executable', [])).toThrow(/ENOENT/);
  });
});
