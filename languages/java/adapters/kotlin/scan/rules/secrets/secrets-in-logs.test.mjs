import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { secretsInLogs } from './secrets-in-logs.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return secretsInLogs(scanned).map((reported) => [
    reported.subject,
    lineOf(scanned, reported.offset),
  ]);
}

describe('secretsInLogs', () => {
  it.each([
    ['a placeholder argument', 'log.info("token {}", token)'],
    ['a template', 'logger.warn("password is $password")'],
    ['a template expression', 'logger.warn("key ${apiKey}")'],
    ['a concatenation', 'log.debug("secret " + clientSecret)'],
    ['a print', 'println("token: $token")'],
    ['a lambda message', 'logger.info { "token $token" }'],
    [
      'a lambda message after the exception',
      'logger.error(e) { "refresh failed for $refreshToken" }',
    ],
    ['a bare value in a lambda', 'logger.debug { password }'],
    ['an Android log call', 'Log.d(TAG, "pw $password")'],
    ['a logger declared from a factory', 'audit.info("token {}", token)'],
    ['a member of an object', 'log.info("token {}", session.token)'],
    ['a getter', 'log.info("token {}", client.getToken())'],
    ['a member in a template', 'logger.warn("key ${config.apiKey}")'],
    ['a value converted to text', 'log.info("pw {}", password.toString())'],
    ['a template followed by a dot', 'logger.warn("using $token.")'],
    ['a key and value pair', 'log.info("login", kv("password", pw))'],
    ['a pair in a map', 'log.info("login {}", mapOf("token" to t))'],
    ['a standard output print', 'System.out.println(token)'],
    ['a standard error print', 'System.err.printf("t %s", token)'],
    ['a Timber call', 'Timber.d("token %s", token)'],
    ['a tagged Timber call', 'Timber.tag("auth").i("token $token")'],
    ['a fluent key and value', 'log.atInfo().addKeyValue("token", t).log("x")'],
    ['a fluent argument', 'log.atInfo().setMessage("t {}").addArgument(token).log()'],
    ['a diagnostic context entry', 'MDC.put("token", t)'],
    ['an exception message', 'throw IllegalStateException("bad token $token")'],
    ['an error call', 'error("bad token $token")'],
    ['a template with a fallback', 'log.info("t ${token ?: "none"}")'],
    ['an environment read', 'log.info("t {}", System.getenv("API_TOKEN"))'],
    ['an environment read in a template', 'println("t ${System.getenv("API_TOKEN")}")'],
    ['a formatted message', 'log.info(String.format("t %s", token))'],
    ['a format extension', 'log.info("t %s".format(token))'],
  ])('flags %s', (_name, line) => {
    const source = `val audit = LoggerFactory.getLogger("audit")\nfun f() {\n    ${line}\n}\n`;

    expect(found(source).map(([, line]) => line)).toEqual([3]);
  });

  it.each([
    ['a presence check', 'log.info("token set: {}", token != null)'],
    ['a length', 'log.info("token length {}", token.length)'],
    ['a flag', 'log.info("has token {}", hasToken)'],
    ['a constant name', 'log.info("reading {}", PASSWORD)'],
    ['a member of the secret', 'log.info("token ${token.length}")'],
    ['a call on something that is not a logger', 'audit.info("token {}", token)'],
    ['a presence check in a lambda', 'logger.info { "token set: ${token != null}" }'],
    ['a dialog, which is not a logger', 'dialog.d(TAG, "pw $password")'],
    ['a status getter', 'log.info("has {}", session.hasToken())'],
    ['a call on the secret', 'log.info("token {}", token.hashCode())'],
    ['a key with a literal value', 'log.info("login", kv("password", "hidden"))'],
    ['a message that only mentions the word', 'log.info("refresh token expired")'],
    ['a marker token of a tokenizer', 'log.info("eos {}", vocab.eosToken)'],
    ['a member of a tokenizer', 'log.info("t {}", tokenizer.token)'],
    ['a key whose value is a status', 'log.info("x", kv("token", session.hasToken))'],
    ['a diagnostic entry whose value is a status', 'MDC.put("token", session.isTokenSet)'],
    ['an exception without the secret', 'throw IllegalStateException("token missing")'],
  ])('passes %s', (_name, line) => {
    expect(found(`fun f() {\n    ${line}\n}\n`)).toEqual([]);
  });
});

describe('secretsInLogs on a long file', () => {
  it('runs in linear time', () => {
    const lines = Array.from(
      { length: 5000 },
      (_, index) => `    log.info("a {} b", x${String(index)}, "c")`,
    );
    const scanned = scanKotlinSource(`fun f() {\n${lines.join('\n')}\n}\n`);
    const started = performance.now();

    const reported = secretsInLogs(scanned);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(reported).toEqual([]);
  });
});
