import { describe, expect, it } from 'vitest';
import { applyRecipe } from '../test-support/apply-recipe.mjs';
import { catchLogRecipe } from './catch-log.mjs';

const HEAD = 'private val log = org.slf4j.LoggerFactory.getLogger("a")\n';
const THROW = 'throw IllegalStateException()';

function fixed(body, path) {
  return applyRecipe(catchLogRecipe, `${HEAD}${body}\n`, path).slice(HEAD.length, -1);
}

function inCatch(statement) {
  return `fun f() { try { g() } catch (e: Exception) { ${statement}; ${THROW} } }`;
}

describe('catchLogRecipe', () => {
  it('passes the caught exception as the last argument', () => {
    expect(fixed(inCatch('log.error("failed: " + e.message)'))).toBe(
      inCatch('log.error("failed: " + e.message, e)'),
    );
  });
  it('keeps a trailing comma in a multi-line call', () => {
    expect(fixed(inCatch('log.warn(\n "x",\n )'))).toBe(inCatch('log.warn(\n "x", e,\n )'));
  });
  it('gives a lambda logger the exception first', () => {
    expect(fixed(inCatch('logger.error { "failed" }'))).toBe(
      inCatch('logger.error(e) { "failed" }'),
    );
  });
  it('fixes test sources and a catch that only logs there', () => {
    const body = 'fun f() { try { g() } catch (e: Exception) { log.error("x") } }';

    expect(fixed(body, 'src/test/kotlin/T.kt')).toBe(
      'fun f() { try { g() } catch (e: Exception) { log.error("x", e) } }',
    );
  });
  it.each([
    inCatch('log.error("x", e)'),
    'fun f() { try { g() } catch (ignored: Exception) { log.error("x"); ' + THROW + ' } }',
    'fun f() { try { g() } catch (e: Exception) { log.error("x") } }',
  ])(
    'leaves calls that pass the exception, ignored names and swallowing main catches alone (%s)',
    (body) => {
      expect(fixed(body)).toBe(body);
    },
  );
  it('declines a call without arguments', () => {
    expect(fixed(inCatch('log.error()'))).toBe(inCatch('log.error()'));
  });
});
