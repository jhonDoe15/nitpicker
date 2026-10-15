import { describe, expect, it } from 'vitest';
import { condenseFailure, withoutJvmNotices } from './failure-text.mjs';

const NOTICE = 'Picked up JAVA_TOOL_OPTIONS: -Dhttps.proxyHost=127.0.0.1';

describe('withoutJvmNotices', () => {
  it('drops the lines the JVM prints for its option variables, and nothing else', () => {
    const text = [NOTICE, 'Picked up _JAVA_OPTIONS: -Xmx1g', 'FAILURE: Build failed', NOTICE].join(
      '\n',
    );

    expect(withoutJvmNotices(text)).toBe('FAILURE: Build failed');
  });

  it('drops the notice behind a PIT minion prefix and the PIT progress lines', () => {
    const text = [
      `12:50:42 PM PIT >> INFO : MINION : ${NOTICE}`,
      '12:50:44\u202fPM PIT >> INFO : Sent tests to minion',
      '12:50:44 PM PIT >> ERROR : minion exited abnormally',
    ].join('\n');

    expect(withoutJvmNotices(text)).toBe('12:50:44 PM PIT >> ERROR : minion exited abnormally');
  });

  it('keeps a line that only mentions the variable', () => {
    expect(withoutJvmNotices('set JAVA_TOOL_OPTIONS to fix it')).toBe(
      'set JAVA_TOOL_OPTIONS to fix it',
    );
  });
});

describe('condenseFailure', () => {
  it('returns a short failure unchanged apart from the JVM notices', () => {
    expect(condenseFailure(`${NOTICE}\nCaused by: boom`, 500)).toBe('Caused by: boom');
  });

  it('keeps the cause of a long failure that the head cut would have lost', () => {
    const noise = Array.from({ length: 400 }, (_, index) => `INFO: step ${String(index)}`);
    const text = [
      NOTICE,
      ...noise,
      'Caused by: org.pitest.help.PitError: Coverage generation minion exited abnormally!',
      ...noise,
      '* What went wrong:',
      "Execution failed for task ':nitpickerPit'.",
    ].join('\n');

    const condensed = condenseFailure(text, 1000);

    expect(condensed.length).toBeLessThanOrEqual(1000);
    expect(condensed).toContain('Caused by: org.pitest.help.PitError');
    expect(condensed).toContain("Execution failed for task ':nitpickerPit'.");
    expect(condensed).not.toContain('Picked up');
    expect(condensed.startsWith('INFO: step 0')).toBe(true);
  });

  it('does not repeat a cause that the head already shows', () => {
    const text = ['Caused by: first', ...Array.from({ length: 300 }, () => 'filler line')].join(
      '\n',
    );

    expect(condenseFailure(text, 400).match(/Caused by: first/g)).toHaveLength(1);
  });
});
