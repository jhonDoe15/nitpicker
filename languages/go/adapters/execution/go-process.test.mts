import { describe, expect, it } from 'vitest';
import { createGoContext } from '../typed/go-run-readers.mts';
import type { Environment } from '../../../../shared/processes/environment.mts';
import { run } from './go-process.mjs';

type Result = { status: number | null; stdout?: string; stderr?: string; error?: Error };

function contextWith(environment: Environment, result: Result) {
  const calls: { program: string; args: readonly string[]; timeout: unknown }[] = [];
  const spawn = (program: string, args: readonly string[], options: { timeout?: unknown }) => {
    calls.push({ program, args, timeout: options.timeout });
    return result;
  };
  return {
    calls,
    context: createGoContext({
      projectRoot: '/project',
      settings: {},
      policy: {},
      reportRoot: '/report',
      spawn,
      environment,
    }),
  };
}

describe('Go tool deadlines', () => {
  it('gives each Go command 25 minutes when no analyzer timeout is configured', () => {
    const { calls, context } = contextWith({}, { status: 0, stdout: '', stderr: '' });
    run(context, ['go', 'version'], { rule: 'go-missing' });
    expect(calls[0]?.timeout).toBe(25 * 60_000);
  });

  it('gives each Go command the configured analyzer deadline and names it on a timeout', () => {
    const { calls, context } = contextWith(
      { NITPICKER_ANALYZER_TIMEOUT_MS: String(90 * 60_000) },
      { status: null, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) },
    );
    expect((): unknown => run(context, ['go', 'vet', './...'], { rule: 'go-vet-failed' })).toThrow(
      'go vet timed out after 90 minutes',
    );
    expect(calls[0]?.timeout).toBe(90 * 60_000);
  });
});
