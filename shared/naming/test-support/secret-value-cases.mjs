const SECRET = 'secret';
const CREDENTIAL = 'credential';
const NONE = 'none';
const PASSWORD = 'password';
const TOKEN = 'token';
const API_KEY = 'apiKey';
const ADMIN_PASSWORD = 'adminPassword';
const PASSPHRASE = 'CorrectHorseBatteryStaple';
const GITHUB_TOKEN = `ghp_${'a1B2'.repeat(9)}`;
const DJANGO_KEY = ['django', 'insecure', 'abcdef'].join('-');
const AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const BEARER = ['Bearer', 'abc123def456'].join(' ');
const DSN = `postgres://${['app', 'Hunter22'].join(':')}@db/app`;

export const SECRET_VALUE_CASES = [
  [PASSWORD, 'Password1!', SECRET],
  [TOKEN, 'Token2024', SECRET],
  [SECRET, 's3cret', SECRET],
  [ADMIN_PASSWORD, 'Admin123', SECRET],
  [API_KEY, 'a1b2c3d4e5', SECRET],
  [ADMIN_PASSWORD, PASSPHRASE, SECRET],
  ['dbPasswordValue', 'Pa55word2024', SECRET],
  ['hmacKey', 's3cr3t-hmac-2024', SECRET],
  ['clientSecret', 'abc123def', SECRET],
  [PASSWORD, 'password1', SECRET],
  [PASSWORD, ':password1', SECRET],
  [PASSWORD, ':dbPassword', NONE],
  [PASSWORD, 'Elephantine', NONE],
  [PASSWORD, 'Passwort', NONE],
  [PASSWORD, 'hunterhunter', NONE],
  [TOKEN, 'Authorization', NONE],
  [TOKEN, PASSPHRASE, NONE],
  [PASSWORD, 'Password', NONE],
  [PASSWORD, '{{secrets.DB_PASSWORD}}', NONE],
  [PASSWORD, '%(db_pw)s', NONE],
  [PASSWORD, '{db_pw1}', NONE],
  [PASSWORD, '$prefix1', NONE],
  [PASSWORD, 'changeme', NONE],
  [TOKEN, '****1234', NONE],
  [TOKEN, '00000000-0000-0000-0000-000000000000', NONE],
  [TOKEN, 'errors.token.expired_v2', NONE],
  ['dbSecret', 'prod/db-creds-v2', NONE],
  [SECRET, 'secret/data/app1', NONE],
  ['credentials', '/etc/app/creds-v2.json', NONE],
  [TOKEN, 'extra_token_1', NONE],
  [PASSWORD, 'pass_word1', NONE],
  [PASSWORD, 'newPassword', NONE],
  [API_KEY, 'X-API-Key', NONE],
  [TOKEN, 'API_TOKEN', NONE],
  [PASSWORD, 'https://x.com/reset1', NONE],
  [TOKEN, 'abc1', NONE],
  [PASSWORD, String.raw`^(?=.*\d).{8,}$`, NONE],
  [TOKEN, GITHUB_TOKEN, CREDENTIAL],
  ['secretKey', DJANGO_KEY, CREDENTIAL],
  [API_KEY, AWS_KEY, CREDENTIAL],
  [TOKEN, BEARER, CREDENTIAL],
  ['dsn', DSN, CREDENTIAL],
];
