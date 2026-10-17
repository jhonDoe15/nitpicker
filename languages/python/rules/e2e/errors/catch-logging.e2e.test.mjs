import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, single } = createScripts();
afterEach(cleanup);

const STDLIB = 'import logging\n\nlogger = logging.getLogger(__name__)\n\n';
const LOGURU = 'from loguru import logger\n\n';
const STRUCTLOG = 'import structlog\n\nlog = structlog.get_logger()\n\n';

function logged(code) {
  return single(code).filter((line) => line.startsWith('catch-log-without-exception '));
}

function handler(prelude, body, name = 'error') {
  const lines = [...body.split('\n'), 'recover()'].map((line) => `        ${line}`);
  return `${prelude}try:\n    run()\nexcept ValueError as ${name}:\n${lines.join('\n')}\n`;
}

describe.skipIf(!enabled)('catch-log-without-exception', () => {
  it.each([
    ['an f-string with the error', STDLIB, 'logger.error(f"failed: {error}")'],
    ['str of the error', STDLIB, 'logger.error("failed: %s", str(error))'],
    ['the message of the error', STDLIB, 'logger.warning("failed: " + error.args[0])'],
    ['exc_info switched off', STDLIB, 'logger.error("failed: %s", str(error), exc_info=False)'],
    ['a value derived from the error', STDLIB, 'message = str(error)\nlogger.error(message)'],
    ['the module level logging function', 'import logging\n\n', 'logging.error(f"{error}")'],
    ['a logger on self', STDLIB, 'self.logger.error(f"{error}")'],
    [
      'a logger called log',
      'import logging\n\nlog = logging.getLogger("x")\n\n',
      'log.warn(f"{error}")',
    ],
    [
      'a logger with another name',
      'import logging\n\nout = logging.getLogger("x")\n\n',
      'out.error(f"{error}")',
    ],
    ['a bound logger', STDLIB, 'logger.bind(user=1).error(f"{error}")'],
    ['the error as a plain argument', STDLIB, 'logger.warning("failed: %s", error)'],
    ['the error in a structured field', STRUCTLOG, 'log.error("failed", error=error)'],
    ['the error in extra', STDLIB, 'logger.error("failed", extra={"error": error})'],
    ['loguru with the error as a placeholder value', LOGURU, 'logger.warning("failed: {}", error)'],
    ['a critical log', STDLIB, 'logger.critical("failed: %s", error)'],
    [
      'a handler that raises another error without from',
      STDLIB,
      'logger.error(f"{error}")\nraise RuntimeError("x")',
    ],
    ['loguru with the text', LOGURU, 'logger.error(f"failed: {error}")'],
    ['loguru with the text of a placeholder', LOGURU, 'logger.warning("failed: {}", str(error))'],
    ['structlog with the text', STRUCTLOG, 'log.error("failed", reason=str(error))'],
  ])('flags %s', (_name, prelude, body) => {
    const [finding, ...rest] = logged(handler(prelude, body));

    expect(finding).toMatch(/^catch-log-without-exception src\/mod\.py:\d+ \S+\(\.\.\.\)$/u);
    expect(rest).toEqual([]);
  });

  it('names the logger call in the finding', () => {
    expect(logged(handler(STDLIB, 'logger.error(f"failed: {error}")'))).toEqual([
      'catch-log-without-exception src/mod.py:8 logger.error(...)',
    ]);
    expect(logged(handler(LOGURU, 'logger.error(f"{error}")'))).toEqual([
      'catch-log-without-exception src/mod.py:6 logger.error(...)',
    ]);
  });

  it.each([
    ['logger.exception', STDLIB, 'logger.exception("failed")'],
    ['logger.exception with the text too', STDLIB, 'logger.exception(f"failed: {error}")'],
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
    ['a bare raise after the log', STDLIB, 'logger.error(f"failed: {error}")\nraise'],
    ['raising the error after the log', STDLIB, 'logger.error("failed: %s", error)\nraise error'],
    [
      'raising another error from this one',
      STDLIB,
      'logger.error(f"failed: {error}")\nraise RuntimeError("x") from error',
    ],
    ['a raise before the log', STDLIB, 'if error:\n    raise\nlogger.error(f"{error}")'],
    ['a debug log', STDLIB, 'logger.debug(f"failed: {error}")'],
    ['an info log', STDLIB, 'logger.info(f"failed: {error}")'],
    ['a log at a numeric level', STDLIB, 'logger.log(40, f"failed: {error}")'],
    ['a structlog event', STRUCTLOG, 'log.msg(f"failed: {error}")'],
    ['a log call that does not use the error', STDLIB, 'logger.error("failed")'],
    ['an object that is not a logger', STDLIB, 'reporter.error(str(error))'],
    ['print', STDLIB, 'print(error)'],
    ['a list append', STDLIB, 'errors.append(error)'],
  ])('allows %s', (_name, prelude, body) => {
    expect(logged(handler(prelude, body))).toEqual([]);
  });

  it('allows a handler without a name and logging outside a handler', () => {
    expect(
      logged(`${STDLIB}try:\n    run()\nexcept ValueError:\n    logger.error("failed")\n`),
    ).toEqual([]);
    expect(logged(`${STDLIB}def f(error):\n    logger.error(f"{error}")\n`)).toEqual([]);
  });

  it('reports a call that uses both variables of nested handlers once', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    try:\n        run()\n    except KeyError as inner:\n        logger.error(f"{inner} {outer}")\n        recover()\n`;

    expect(logged(code)).toEqual(['catch-log-without-exception src/mod.py:11 logger.error(...)']);
  });

  it('flags a call made after the nested handler for the outer variable', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    try:\n        run()\n    except KeyError:\n        pass\n    logger.error(f"{outer}")\n    recover()\n`;

    expect(logged(code)).toEqual(['catch-log-without-exception src/mod.py:12 logger.error(...)']);
  });

  it('flags a call in a nested handler that uses only the outer variable', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    try:\n        run()\n    except KeyError as inner:\n        logger.error(f"{outer}")\n        logger.error("%s", inner, exc_info=inner)\n        recover()\n`;

    expect(logged(code)).toEqual(['catch-log-without-exception src/mod.py:11 logger.error(...)']);
  });

  it('does not take a raise in a nested handler as a re-raise of the outer error', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as outer:\n    logger.error(f"{outer}")\n    try:\n        run()\n    except KeyError:\n        raise\n`;

    expect(logged(code)).toEqual(['catch-log-without-exception src/mod.py:8 logger.error(...)']);
  });

  it('leaves a handler that only logs to swallowed-exception, so the site is reported once', () => {
    const code = `${STDLIB}try:\n    run()\nexcept ValueError as error:\n    logger.error(f"{error}")\n`;

    expect(single(code)).toEqual(['swallowed-exception src/mod.py:7 except ValueError']);
  });
});
