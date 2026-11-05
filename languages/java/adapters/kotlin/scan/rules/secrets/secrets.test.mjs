import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../../kotlin-source.mjs';
import { credentialLiterals, hardcodedSecrets } from './hardcoded-secrets.mjs';
import { SECRET_VALUE_CASES } from '../../../../../../../shared/naming/test-support/secret-value-cases.mjs';

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
    ['a value that keeps its digits', 'val token = "Token2024"\n'],
    ['a value with a mark', 'val password = "Password1!"\n'],
    ['a value followed by an operand', 'val token = "a1b2c3d4e5" + read()\n'],
    ['a trimmed raw string', 'val token = """a1b2c3d4e5""".trimIndent()\n'],
    ['a margin-trimmed string', 'val token = "a1b2c3d4e5".trimMargin()\n'],
    ['an encoded string', 'val secret = "s3cret-bytes".encodeToByteArray()\n'],
    ['a lowercased string', 'val token = "a1B2c3D4e5".lowercase()\n'],
    ['a cast', 'val token = "a1b2c3d4e5" as String\n'],
    ['a scope function', 'val token = "a1b2c3d4e5".let { it }\n'],
    ['a side effect', 'val token = "a1b2c3d4e5".also { log(it) }\n'],
    ['a lazy delegate', 'val token by lazy { "a1b2c3d4e5" }\n'],
    ['a typed lazy value', 'val apiKey: Lazy<String> = lazy { "k3y-prod-1" }\n'],
    ['an expression body', 'fun token() = "a1b2c3d4e5"\n'],
    ['a function that returns it', 'fun token(): String { return "a1b2c3d4e5" }\n'],
    ['a getter', 'val token: String get() = "a1b2c3d4e5"\n'],
    ['a when branch', 'val token = when (env) { "prod" -> "a1b2c3d4e5"; else -> read() }\n'],
    ['a braced if branch', 'val token = if (prod) { "a1b2c3d4e5" } else { read() }\n'],
    ['a map fallback in a lambda', 'val token = map.getOrElse("T") { "a1b2c3d4e5" }\n'],
    ['a keyed fallback in a lambda', 'map.getOrPut("token") { "a1b2c3d4e5" }\n'],
    [
      'a property placeholder default',
      '@Value("\\${db.password:hunter22}") lateinit var pw: String\n',
    ],
    ['a keyed default', 'val x = System.getProperty("db.password", "hunter22")\n'],
    ['a bind parameter look-alike with digits', 'val password = ":password1"\n'],
  ])('flags %s', (_name, source) => {
    expect(found(hardcodedSecrets, source)).toEqual([['HardcodedSecret', 1]]);
  });

  it('leaves a property placeholder default in a Spring file to SpringValueSecretDefault', () => {
    const source = [
      'import org.springframework.beans.factory.annotation.Value',
      'class C(@Value("\\${db.password:hunter22}") val pw: String)',
      '',
    ].join('\n');

    expect(found(hardcodedSecrets, source)).toEqual([]);
  });

  it.each([
    ['a fallback on the next line', 'val token = read()\n    ?: "a1b2c3d4e5"\n'],
    ['a getter on the next line', 'val token: String\n    get() = "a1b2c3d4e5"\n'],
    ['a when branch on its own line', 'val token = when (env) {\n    "prod" -> "a1b2c3d4e5"\n}\n'],
  ])('flags %s at the literal', (_name, source) => {
    expect(found(hardcodedSecrets, source)).toEqual([['HardcodedSecret', 2]]);
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
    ['a literal joined after another operand', 'val token = read() + "a1b2c3d4e5"\n'],
    ['a comparison inside the value', 'val token = if (read() != "abc123def") read() else ""\n'],
    ['a pattern', 'val password = """^(?=.*\\d).{8,}$""".toRegex()\n'],
    ['a format string', 'val token = "%s-%d-v1".format(a, b)\n'],
    ['a when condition', 'val token = when (env) { "prod1x" -> read(); else -> "" }\n'],
    ['an exception message', 'val token = env["T"] ?: error("token missing 1")\n'],
    ['a pair in a call that is not a map', 'track("password", "hunter22")\n'],
    ['a value that names a secret', 'intent.putExtra("token", "extra_token_1")\n'],
    ['a secret path', 'val dbSecret = "prod/db-creds-v2"\n'],
    ['a vault path', 'val secret = "secret/data/app1"\n'],
    ['a credential file', 'val credentials = "/etc/app/creds-v2.json"\n'],
    ['a message key', 'val TOKEN = "errors.token.expired_v2"\n'],
    ['a templated placeholder', 'val password = "{{secrets.DB_PASSWORD}}"\n'],
    [
      'a property placeholder without a default',
      '@Value("\\${db.password}") lateinit var pw: String\n',
    ],
    ['a credential, which has its own rule', `val token = "ghp_${'a1B2'.repeat(9)}"\n`],
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

describe('the shared secret value rules', () => {
  const RULES = {
    secret: [['HardcodedSecret', 1]],
    credential: [['CredentialLiteral', 1]],
    none: [],
  };

  it.each(SECRET_VALUE_CASES)('read val %s = %j as %s', (name, value, expected) => {
    const literal = JSON.stringify(value).replaceAll('$', String.raw`\$`);
    const source = `val ${name} = ${literal}\n`;

    expect([...found(hardcodedSecrets, source), ...found(credentialLiterals, source)]).toEqual(
      RULES[expected],
    );
  });

  it('reads a long file in linear time', () => {
    const lines = Array.from({ length: 5000 }, (_, index) => [
      `    val token${String(index)} = read("k")`,
      `    m.put("token", "v${String(index)}")`,
    ]);
    const scanned = scanKotlinSource(`fun f() {\n${lines.flat().join('\n')}\n}\n`);
    const started = performance.now();

    const reported = hardcodedSecrets(scanned);

    expect(performance.now() - started).toBeLessThan(1000);
    expect(reported).toEqual([]);
  });
});
