import { describe, expect, it } from 'vitest';
import { createGoContext } from '../go-steps.mjs';
import { run } from './go-process.mjs';

function contextWith(environment, result) {
  const calls = [];
  const spawn = (program, args, options) => {
    calls.push({ program, args, timeout: options.timeout });
    return result;
  };
  return {
    calls,
    context: createGoContext({ projectRoot: '/project', spawn, environment }),
  };
}

describe('Go tool deadlines', () => {
  it('gives each Go command 25 minutes when no analyzer timeout is configured', () => {
    const { calls, context } = contextWith({}, { status: 0, stdout: '', stderr: '' });
    run(context, ['go', 'version'], { rule: 'go-missing' });
    expect(calls[0].timeout).toBe(25 * 60_000);
  });

  it('gives each Go command the configured analyzer deadline and names it on a timeout', () => {
    const { calls, context } = contextWith(
      { NITPICKER_ANALYZER_TIMEOUT_MS: String(90 * 60_000) },
      { status: null, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) },
    );
    expect(() => run(context, ['go', 'vet', './...'], { rule: 'go-vet-failed' })).toThrow(
      'go vet timed out after 90 minutes',
    );
    expect(calls[0].timeout).toBe(90 * 60_000);
  });
});
