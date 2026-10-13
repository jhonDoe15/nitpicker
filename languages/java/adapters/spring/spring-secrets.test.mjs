import { describe, expect, it } from 'vitest';
import { isLiteralSecret, secretVariable } from './spring-secrets.mjs';

describe('isLiteralSecret: keys', () => {
  it.each([
    'spring.datasource.password',
    'password',
    'app.db-password',
    'app.dbPassword',
    'app.DB_PASSWORD',
    'app.client-secret',
    'app.jwtSecret',
    'app.JWTSecret',
    'app.access-token',
    'app.api-key',
    'app.apiKey',
    'app.apikey',
    'app.private-key',
    'app.secret-key',
    'app.access-key',
    'app.credentials',
    'server.ssl.key-store-password',
    'app.passwords[0].password',
  ])('flags a literal under %s', (key) => {
    expect(isLiteralSecret(key, 'hunter2')).toBe(true);
  });

  it.each([
    'app.password-reset',
    'app.password-file',
    'app.passwords',
    'app.token-validity-seconds',
    'app.secrets',
    'app.key',
    'app.key-store',
    'app.public-key',
    'app.keyword',
    'app.passwordless',
    'app.tokens[0]',
    'app.secret.header',
    '',
  ])('does not treat %s as a secret key', (key) => {
    expect(isLiteralSecret(key, 'hunter2')).toBe(false);
  });
});

describe('isLiteralSecret: values', () => {
  const key = 'spring.datasource.password';

  it.each([
    'hunter2',
    'changeme',
    '{noop}plain',
    '${DB_PASS:hunter2}',
    '${DB_PASS:${OTHER:hunter2}}',
    '12345abc',
    '*notanalias!',
    '@',
  ])('flags %s', (value) => {
    expect(isLiteralSecret(key, value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'true',
    'FALSE',
    'on',
    'off',
    'yes',
    'no',
    '3600',
    '-1',
    '1.5',
    'null',
    'NULL',
    '~',
    '*ref',
    '@db.password@',
    'ENC(AbC123==)',
    '{cipher}AQB1',
    '{bcrypt}$2a$10$abc',
    '{pbkdf2}abc',
    '#{systemProperties.password}',
    '${DB_PASS}',
    '${DB_PASS:}',
    '${DB_PASS:true}',
    '${DB_PASS:3600}',
    '${A}${B}',
    '${A}-suffix',
  ])('does not flag %s', (value) => {
    expect(isLiteralSecret(key, value)).toBe(false);
  });

  it('skips enum-like words for token keys only', () => {
    expect([
      isLiteralSecret('feature.reset-token', 'header'),
      isLiteralSecret('feature.reset-token', 'x_auth-header'),
      isLiteralSecret('feature.reset-token', 'abc123'),
      isLiteralSecret('feature.reset-token', 'Header'),
      isLiteralSecret('app.password', 'header'),
      isLiteralSecret('app.client-secret', 'header'),
    ]).toEqual([false, false, true, true, true, true]);
  });
});

describe('secretVariable', () => {
  it('names the environment variable Spring binds to the key', () => {
    expect(
      [
        'spring.datasource.password',
        'app.client-secret',
        'app.apiKey',
        'app.service.jwtSecret',
        'app.private_key',
        'app.tokens[0].access-token[1]',
      ].map(secretVariable),
    ).toEqual([
      'SPRING_DATASOURCE_PASSWORD',
      'APP_CLIENTSECRET',
      'APP_APIKEY',
      'APP_SERVICE_JWTSECRET',
      'APP_PRIVATE_KEY',
      'APP_TOKENS_ACCESSTOKEN',
    ]);
  });
});
