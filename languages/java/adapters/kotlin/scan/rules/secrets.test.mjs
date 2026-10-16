import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { credentialLiterals, hardcodedSecrets, secretsInLogs } from './secrets.mjs';

function found(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [reported.rule, lineOf(scanned, reported.offset)]);
}

describe('hardcodedSecrets', () => {
  it.each([
    ['a password property', 'val password = "hunter22"\n'],
    ['a typed api key', 'private val apiKey: String = "k3y-for-prod"\n'],
    ['a named argument', 'val client = Client(clientSecret = "abc123def")\n'],
    ['a map entry', 'val settings = mapOf("db.password" to "s3cret99")\n'],
    ['a property pair', 'props.setProperty("auth.token", "t0ken-value")\n'],
    ['an escaped dollar', 'val signingKey = "pa\\$\\$w0rd!"\n'],
  ])('flags %s', (_name, source) => {
    expect(found(hardcodedSecrets, source)).toEqual([['HardcodedSecret', 1]]);
  });

  it.each([
    ['a placeholder', 'val password = "changeme"\n'],
    ['an environment variable name', 'val token = "GITHUB_TOKEN"\n'],
    ['a template', 'val password = "${prefix}123abc"\n'],
    ['a short value', 'val pwd = "a1"\n'],
    ['a header name', 'val csrfToken = "X-CSRF-TOKEN"\n'],
    ['a URL', 'val tokenUrl = "https://auth.example.com/token1"\n'],
    ['a name that is not a secret', 'val username = "admin123"\n'],
    ['a comparison', 'val same = password == "hunter22"\n'],
  ])('passes %s', (_name, source) => {
    expect(found(hardcodedSecrets, source)).toEqual([]);
  });
});

describe('credentialLiterals', () => {
  it.each([
    ['an AWS key', 'val id = "AKIAABCDEFGHIJKLMNOP"\n'],
    ['a GitHub token', `val t = "ghp_${'a'.repeat(36)}"\n`],
    ['a password in a URL', 'val url = "postgres://app:s3cretpw@db:5432/app"\n'],
    ['a JDBC password', 'val url = "jdbc:mysql://db/app?user=a&password=s3cretpw"\n'],
    ['a private key header', 'val pem = "-----BEGIN RSA PRIVATE KEY-----"\n'],
  ])('flags %s', (_name, source) => {
    expect(found(credentialLiterals, source)).toEqual([['CredentialLiteral', 1]]);
  });

  it('passes a URL without a password and a password from a template', () => {
    expect(
      found(
        credentialLiterals,
        'val a = "https://example.com/x"\nval b = "postgres://app:${pw}@db/app"\n',
      ),
    ).toEqual([]);
  });
});

describe('secretsInLogs', () => {
  it.each([
    ['a placeholder argument', 'log.info("token {}", token)'],
    ['a template', 'logger.warn("password is $password")'],
    ['a template expression', 'logger.warn("key ${apiKey}")'],
    ['a concatenation', 'log.debug("secret " + clientSecret)'],
    ['a print', 'println("token: $token")'],
  ])('flags %s', (_name, line) => {
    expect(found(secretsInLogs, `fun f() {\n    ${line}\n}\n`)).toEqual([['SecretInLog', 2]]);
  });

  it.each([
    ['a presence check', 'log.info("token set: {}", token != null)'],
    ['a length', 'log.info("token length {}", token.length)'],
    ['a flag', 'log.info("has token {}", hasToken)'],
    ['a constant name', 'log.info("reading {}", PASSWORD)'],
    ['a member of the secret', 'log.info("token ${token.length}")'],
    ['a call on something that is not a logger', 'audit.info("token {}", token)'],
  ])('passes %s', (_name, line) => {
    expect(found(secretsInLogs, `fun f() {\n    ${line}\n}\n`)).toEqual([]);
  });
});
