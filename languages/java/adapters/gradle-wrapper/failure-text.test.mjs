import { exactText } from '../../../../core/diff/reporting/test-support/output-expectations.mjs';
import { describe, expect, it } from 'vitest';
import { condenseFailure, withoutToolNoise } from './failure-text.mjs';

const NOTICE = 'Picked up JAVA_TOOL_OPTIONS: -Dhttps.proxyHost=127.0.0.1';
const WENT_WRONG = ['* What went wrong:', "Execution failed for task ':nitpickerPit'."];
const TRY = ['* Try:', '> Run with --stacktrace option to get the stack trace.'];

function noise(count, label = 'step') {
  return Array.from({ length: count }, (_, index) => `INFO: ${label} ${String(index)}`);
}

describe('withoutToolNoise', () => {
  it('drops the lines the JVM prints for its option variables, and nothing else', () => {
    const text = [NOTICE, 'Picked up _JAVA_OPTIONS: -Xmx1g', 'FAILURE: Build failed', NOTICE].join(
      '\n',
    );

    expect(withoutToolNoise(text)).toBe('FAILURE: Build failed');
  });

  it('drops the notice behind a PIT minion prefix, PIT progress in any locale and Checkstyle warnings', () => {
    const text = [
      `12:50:42 PM PIT >> INFO : MINION : ${NOTICE}`,
      '12:50:44 PM PIT >> INFO : Sent tests to minion',
      '3:58:17?PM PIT >> INFO : Created 1 mutation test units',
      '[ant:checkstyle] [WARN] /src/A.java:3: Line is longer than 100 characters',
      '12:50:44 PM PIT >> ERROR : minion exited abnormally',
    ].join('\n');

    expect(withoutToolNoise(text)).toBe('12:50:44 PM PIT >> ERROR : minion exited abnormally');
  });

  it('drops the SLF4J warnings a tool without a logging provider prints', () => {
    const text = [
      'SLF4J(W): No SLF4J providers were found.',
      'SLF4J(W): Defaulting to no-operation (NOP) logger implementation',
      'Handler.java:44: error: cannot find symbol',
    ].join('\n');

    expect(withoutToolNoise(text)).toBe('Handler.java:44: error: cannot find symbol');
  });

  it('keeps a line that only mentions the variable', () => {
    expect(withoutToolNoise('set JAVA_TOOL_OPTIONS to fix it')).toBe(
      'set JAVA_TOOL_OPTIONS to fix it',
    );
  });
});

describe('condenseFailure', () => {
  it('returns a short failure unchanged apart from the tool noise', () => {
    expect(condenseFailure(`${NOTICE}\nCaused by: boom`, 500)).toBe('Caused by: boom');
  });

  it('keeps the cause and the whole failure block, cutting the noisy middle', () => {
    const cause =
      'Caused by: org.pitest.help.PitError: Coverage generation minion exited abnormally!';
    const text = [NOTICE, ...noise(400), cause, ...noise(400, 'later'), ...WENT_WRONG, ...TRY].join(
      '\n',
    );

    const condensed = condenseFailure(text, 1000);

    const [failure, kept, head] = condensed.split('\n...\n');
    expect(condensed.length).toBeLessThanOrEqual(1000);
    expect(head.split('\n')[0]).toBe('INFO: step 0');
    expect(kept).toBe(cause);
    expect(failure).toBe(WENT_WRONG.join('\n'));
  });

  it('keeps the start of an overlong failure block rather than its end', () => {
    const text = [...noise(50), ...WENT_WRONG, ...noise(400, 'detail')].join('\n');

    const condensed = condenseFailure(text, 300);

    expect(condensed.length).toBeLessThanOrEqual(300);
    expect(condensed.split('\n').slice(0, 2)).toEqual(WENT_WRONG);
  });

  it('keeps the end of a long failure without a Gradle failure block', () => {
    const text = [...noise(400), 'the last word'].join('\n');

    const condensed = condenseFailure(text, 400);

    expect(condensed.length).toBeLessThanOrEqual(400);
    expect(condensed).toEqual(
      expect.stringMatching(
        exactText`${/(?:[A-Z0-9: a-z]*\n)+/}the last word\n...\nINFO: step 0\n${/(?:INFO: step [0-9]+\n)+INFO/}`,
      ),
    );
  });

  it('does not repeat a cause that the head already shows', () => {
    const text = ['Caused by: first', ...noise(300), ...WENT_WRONG].join('\n');

    expect(condenseFailure(text, 400).match(/Caused by: first/g)).toHaveLength(1);
  });
});
