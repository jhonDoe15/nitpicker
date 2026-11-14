import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-hardcoded-secret.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/adapters/billing-client.ts';

const secret = (name) => ({ messageId: 'hardcodedSecret', data: { name: `\`${name}\`` } });
const credential = { messageId: 'credentialLiteral' };

tester.run('no-hardcoded-secret', rule, {
  valid: [
    'const token = "2024-01-01T00:00:00Z";',
    'const password = "2024-01-01";',
    'const config = (await load()) ?? {};',
    'const value = (await load()) || 1;',
    'const password = process.env.DB_PASSWORD;',
    'const password = process.env.DB_PASSWORD ?? "";',
    'const apiKey = loadKey();',
    'const token = "";',
    'const password = "changeme";',
    'const password = "<your password>";',
    `const password = "\${DB_PASSWORD}";`,
    'const password = "hunter";',
    'const tokenUrl = "https://auth.example.com/token";',
    'const tokenHeader = "x-auth-token1";',
    'const SECRET_KEY_NAME = "secret-key-name";',
    'const eosToken = "</s>1";',
    'const passwordField = "Passw0rd1";',
    'const config = { host: "db1.internal", port: "5432" };',
    'const user = { username: "admin1234" };',
    'const token = "token";',
    'const label = "ghp";',
    'const message = "Bearer";',
    'const config = { passwordMinLength: "12345678" };',
    'enum Keys { Token = "abc123def" }',
    'function f({ password } = {}) { return password; }',
    'const apiKey = process.env.API_KEY || readKey();',
    'const text = "see the docs at https://example.com";',
  ].map((code) => ({ filename, code })),
  invalid: [
    { code: 'const password = "abc" + "123def456";', errors: [secret('password')] },
    { code: 'const url = "jdbc:postgresql://app:Hunter2x@db/app";', errors: [credential] },
    { code: 'const password = "s3cr3t-Value";', errors: [secret('password')] },
    { code: 'const apiKey = "a1b2c3d4e5f6";', errors: [secret('apiKey')] },
    { code: 'let dbPassword: string = "Passw0rd!";', errors: [secret('dbPassword')] },
    { code: 'const config = { token: "abc123def456" };', errors: [secret('token')] },
    { code: 'const config = { "api_key": "abc123def456" };', errors: [secret('api_key')] },
    {
      code: 'class Client { private secret = "abc123def456"; }',
      errors: [secret('secret')],
    },
    { code: 'client.password = "Passw0rd!";', errors: [secret('password')] },
    { code: 'config["api_key"] = "abc123def456";', errors: [secret('api_key')] },
    { code: 'function f(token = "abc123def456") { return token; }', errors: [secret('token')] },
    { code: 'const jwtSecret = "abc123" + suffix;', errors: [secret('jwtSecret')] },
    { code: 'const secret = ("abc123def456" as string);', errors: [secret('secret')] },
    { code: 'const password = Buffer.from("abc123def456");', errors: [secret('password')] },
    { code: 'const password = "abc123def456".trim();', errors: [secret('password')] },
    { code: 'const apiKey = loaded || "abc123def456";', errors: [secret('apiKey')] },
    { code: 'const apiKey = flag ? "abc123def456" : loaded;', errors: [secret('apiKey')] },
    { code: 'const key = process.env.API_TOKEN ?? "abc123def456";', errors: [secret('API_TOKEN')] },
    {
      code: 'const key = import.meta.env.VITE_API_TOKEN || "abc123def456";',
      errors: [secret('VITE_API_TOKEN')],
    },
    { code: 'const url = "AKIAIOSFODNN7EXAMPLE";', errors: [credential] },
    { code: 'const url = "postgres://app:Hunter2x@db/app";', errors: [credential] },
    { code: 'const note = `ghp_0123456789abcdefghijklmnopqrstuvwxyz`;', errors: [credential] },
    { code: ['call("-----BEGIN PRIVATE', 'KEY-----");'].join(' '), errors: [credential] },
  ].map((test) => ({ filename, ...test })),
});
