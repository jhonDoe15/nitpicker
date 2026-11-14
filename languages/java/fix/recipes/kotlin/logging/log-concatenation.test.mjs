import { describe, expect, it } from 'vitest';
import { applyRecipe } from '../test-support/apply-recipe.mjs';
import { logConcatenationRecipe } from './log-concatenation.mjs';

const HEAD = 'import org.slf4j.LoggerFactory\nprivate val log = LoggerFactory.getLogger("a")\n';

function fixed(body) {
  return applyRecipe(logConcatenationRecipe, `${HEAD}${body}\n`).slice(HEAD.length, -1);
}

describe('logConcatenationRecipe', () => {
  it.each([
    [
      'fun f() { log.info("user " + user.name + " done") }',
      'fun f() { log.info("user {} done", user.name) }',
    ],
    [
      `fun f() { log.warn("user $user took \${t.ms()} ms") }`,
      'fun f() { log.warn("user {} took {} ms", user, t.ms()) }',
    ],
    ['fun f() { log.error("a" + "b" + "$c") }', 'fun f() { log.error("ab{}", c) }'],
  ])('rewrites %s into placeholders', (body, expected) => {
    expect(fixed(body)).toBe(expected);
  });
  it.each([
    'fun f() { log.info("a {} " + b) }',
    'fun f() { log.info("a\\n" + b) }',
    'fun f() { log.info(a + "b") }',
    'fun f() { log.info("a " + (b ?: c)) }',
    'fun f() { log.info("a " + b, e) }',
    'fun f() { log.debug("a " + b) }',
    'fun f() { log.info("a" + """raw $b""") }',
    'fun f() { log.info(String.format("a %s", b)) }',
  ])('declines when it cannot prove the rewrite (%s)', (body) => {
    expect(fixed(body)).toBe(body);
  });
  it('needs a logger with placeholders', () => {
    const text =
      'private val log = java.util.logging.Logger.getLogger("a")\nfun f() { log.info("a " + b) }\n';

    expect(applyRecipe(logConcatenationRecipe, text)).toBe(text);
  });
  it('is a review fix because an operand may be a throwable', () => {
    expect(logConcatenationRecipe.safety).toBe('review');
  });
});
