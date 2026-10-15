import { describe, expect, it } from 'vitest';
import { credentialUrl, isLiteralSecret, secretVariable } from './spring-secrets.mjs';

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
    'jwt.signing-key',
    'security.jwt.signingKey',
    'app.encryption-key',
    'app.hmac-key',
    'app.jwt-key',
    'app.encryption.key',
    'stripe.api.key',
    'security.jwt.key',
    'app.signing.key',
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
    'spring.data.redis.key',
    'app.cache.key',
    'app.key-prefix',
    'key',
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
    'classpath:certs/private.pem',
    'file:/etc/keys/jwt.pem',
    'classpath*:keys/*.pem',
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

describe('credentialUrl', () => {
  it.each([
    'jdbc:postgresql://db:5432/shop?user=shop&password=Sup3rS3cret',
    'jdbc:mysql://db/shop?PASSWORD=x&useSSL=false',
    'jdbc:sqlserver://db;databaseName=shop;pwd=Sup3rS3cret',
    'mongodb://app:Sup3rS3cret@mongo:27017',
    'amqp://:Sup3rS3cret@broker',
    'https://example.com/hook?token=abc123',
    '${DB_URL:jdbc:postgresql://db/shop?password=Sup3rS3cret}',
  ])('flags %s', (value) => {
    expect(credentialUrl(value)).toBe(true);
  });

  it.each([
    '',
    'jdbc:postgresql://db:5432/shop',
    'jdbc:postgresql://db/shop?password=${DB_PASSWORD}',
    'mongodb://app:${PASSWORD}@mongo',
    'https://user@example.com/path',
    'https://example.com:8443/path',
    'https://example.com/a?passwordless=true',
    'password=abc',
  ])('does not flag %j', (value) => {
    expect(credentialUrl(value)).toBe(false);
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
