import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { credentialLiterals, hardcodedSecrets } from './hardcoded-secrets.mjs';
import { secretsInLogs } from './secrets-in-logs.mjs';

const PRIVATE_KEY_HEADER = ['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ');

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
    ['a property assignment', 'config.dbPassword = "hunter22"\n'],
    ['an indexed entry', 'settings["db.password"] = "hunter22"\n'],
    ['a character array', 'val password = "hunter22".toCharArray()\n'],
    ['a byte array', 'val secret = "s3cret-bytes".toByteArray()\n'],
    ['a concatenation of literals', 'val apiKey = "prod-" + "Abc123Xyz789"\n'],
    [
      'an elvis fallback of an environment read',
      'val token = System.getenv("TOKEN") ?: "a1b2c3d4e5"\n',
    ],
    ['a map fallback', 'val token = env.getOrDefault("TOKEN", "a1b2c3d4e5")\n'],
    ['a property fallback', 'val password = System.getProperty("db.pw", "hunter22")\n'],
    ['an optional fallback', 'val token = lookup().orElse("a1b2c3d4e5")\n'],
    ['a lazy fallback', 'val token = lookup().orElseGet { "a1b2c3d4e5" }\n'],
    ['a non-null fallback', 'val token = Objects.requireNonNullElse(read(), "a1b2c3d4e5")\n'],
    ['an if branch', 'val token = if (prod) "a1b2c3d4e5" else read()\n'],
    ['a name with a value suffix', 'val passwordText = "hunter22"\n'],
    ['a key that signs', 'val jwtKey = "s3cr3t-jwt-2024"\n'],
  ])('flags %s', (_name, source) => {
    expect(found(hardcodedSecrets, source)).toEqual([['HardcodedSecret', 1]]);
  });

  it('flags a fallback on the next line at the literal', () => {
    expect(found(hardcodedSecrets, 'val token = read()\n    ?: "a1b2c3d4e5"\n')).toEqual([
      ['HardcodedSecret', 2],
    ]);
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
    ['a value that is the name', 'val password = "password"\n'],
    ['a literal that is not the fallback', 'val token = lookup("a1b2c3d4e5")\n'],
    ['a literal used in a call chain', 'val token = "a1b2c3d4e5".equals(read())\n'],
    ['a literal with another operand', 'val token = "a1b2c3d4e5" + read()\n'],
    ['an empty fallback', 'val token = System.getenv("TOKEN") ?: ""\n'],
    ['a lambda parameter', 'val check = { password: String -> password == "hunter22" }\n'],
    ['a template fallback', 'val token = System.getenv("TOKEN") ?: "$prefix-1a2b3c"\n'],
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
    ['a private key header', `val pem = "${PRIVATE_KEY_HEADER}"\n`],
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
  ])('flags %s', (_name, line) => {
    const source = `val audit = LoggerFactory.getLogger("audit")\nfun f() {\n    ${line}\n}\n`;

    expect(found(secretsInLogs, source)).toEqual([['SecretInLog', 3]]);
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
  ])('passes %s', (_name, line) => {
    expect(found(secretsInLogs, `fun f() {\n    ${line}\n}\n`)).toEqual([]);
  });
});
