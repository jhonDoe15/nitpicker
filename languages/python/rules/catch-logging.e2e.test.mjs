import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from './test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, single } = createScripts();
afterEach(cleanup);

const STDLIB = 'import logging\n\nlogger = logging.getLogger(__name__)\n\n';
const LOGURU = 'from loguru import logger\n\n';
const STRUCTLOG = 'import structlog\n\nlog = structlog.get_logger()\n\n';

function handler(prelude, body, name = 'error') {
  const lines = body.split('\n').map((line) => `        ${line}`);
  return `${prelude}try:\n    run()\nexcept ValueError as ${name}:\n${lines.join('\n')}\n`;
}

describe.skipIf(!enabled)('catch-log-without-exception', () => {
  it.each([
    ['an f-string with the error', STDLIB, 'logger.error(f"failed: {error}")'],
    ['str of the error', STDLIB, 'logger.error("failed: %s", str(error))'],
    ['the message of the error', STDLIB, 'logger.info("failed: " + error.args[0])'],
    ['exc_info switched off', STDLIB, 'logger.error("failed: %s", str(error), exc_info=False)'],
    ['a value derived from the error', STDLIB, 'message = str(error)\nlogger.error(message)'],
    ['the module level logging function', 'import logging\n\n', 'logging.error(f"{error}")'],
    ['a logger on self', STDLIB, 'self.logger.error(f"{error}")'],
    [
      'a logger called log',
      'import logging\n\nlog = logging.getLogger("x")\n\n',
      'log.debug(f"{error}")',
    ],
    [
      'a logger with another name',
      'import logging\n\nout = logging.getLogger("x")\n\n',
      'out.error(f"{error}")',
    ],
    ['a bound logger', STDLIB, 'logger.bind(user=1).error(f"{error}")'],
    ['loguru with the text', LOGURU, 'logger.error(f"failed: {error}")'],
    ['loguru with the text of a placeholder', LOGURU, 'logger.warning("failed: {}", str(error))'],
    ['structlog with the text', STRUCTLOG, 'log.error("failed", reason=str(error))'],
  ])('flags %s', (_name, prelude, body) => {
    const [finding, ...rest] = single(handler(prelude, body));

    expect(finding).toMatch(/^catch-log-without-exception src\/mod\.py:\d+ \S+\(\.\.\.\)$/u);
    expect(rest).toEqual([]);
  });

  it('names the logger call in the finding', () => {
    expect(single(handler(STDLIB, 'logger.error(f"failed: {error}")'))).toEqual([
      'catch-log-without-exception src/mod.py:8 logger.error(...)',
    ]);
    expect(single(handler(LOGURU, 'logger.error(f"{error}")'))).toEqual([
      'catch-log-without-exception src/mod.py:6 logger.error(...)',
    ]);
  });

  it.each([
    ['logger.exception', STDLIB, 'logger.exception("failed")'],
    ['logger.exception with the text too', STDLIB, 'logger.exception(f"failed: {error}")'],
    ['the error as a plain argument', STDLIB, 'logger.warning("failed: %s", error)'],
    ['the error in a structured field', STRUCTLOG, 'log.error("failed", error=error)'],
    ['the error in extra', STDLIB, 'logger.error("failed", extra={"error": error})'],
    ['loguru with the error as a placeholder value', LOGURU, 'logger.warning("failed: {}", error)'],
    ['exc_info=True', STDLIB, 'logger.error("failed: %s", error, exc_info=True)'],
    ['exc_info with the error', STDLIB, 'logger.warning("failed", exc_info=error)'],
    ['exc_info from sys', STDLIB, 'logger.error(f"{error}", exc_info=sys.exc_info())'],
    [
      'the logging function with exc_info',
      'import logging\n\n',
      'logging.error(f"{error}", exc_info=True)',
    ],
    ['a bound logger with exception', STDLIB, 'logger.bind(user=1).exception(f"{error}")'],
    ['loguru exception', LOGURU, 'logger.exception("failed")'],
    ['loguru opt with the error', LOGURU, 'logger.opt(exception=error).error("failed")'],
    ['loguru opt with True', LOGURU, 'logger.opt(exception=True).error(f"{error}")'],
    ['structlog exception', STRUCTLOG, 'log.exception("failed")'],
    ['structlog exc_info', STRUCTLOG, 'log.error("failed", exc_info=True)'],
    ['a log call that does not use the error', STDLIB, 'logger.error("failed")'],
    ['an object that is not a logger', STDLIB, 'reporter.error(str(error))'],
    ['print', STDLIB, 'print(error)'],
    ['a list append', STDLIB, 'errors.append(error)'],
  ])('allows %s', (_name, prelude, body) => {
    expect(single(handler(prelude, body))).toEqual([]);
  });

  it('allows a handler without a name and logging outside a handler', () => {
    expect(
      single(`${STDLIB}try:\n    run()\nexcept ValueError:\n    logger.error("failed")\n`),
    ).toEqual([]);
    expect(single(`${STDLIB}def f(error):\n    logger.error(f"{error}")\n`)).toEqual([]);
  });

  it('reports a call of a nested handler once, for its own variable', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    try:\n        run()\n    except KeyError as inner:\n        logger.error(f"{inner} {outer}")\n`;

    expect(single(code)).toEqual(['catch-log-without-exception src/mod.py:11 logger.error(...)']);
  });

  it('flags a call made after the nested handler for the outer variable', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    try:\n        run()\n    except KeyError:\n        pass\n    logger.error(f"{outer}")\n`;

    expect(single(code)).toEqual([
      'swallowed-exception src/mod.py:10 except KeyError',
      'catch-log-without-exception src/mod.py:12 logger.error(...)',
    ]);
  });
});
