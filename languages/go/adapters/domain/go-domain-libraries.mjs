import { RULE_IDS } from '../../../../shared/policy.mjs';

const IO_PACKAGES = new Set([
  'os',
  'os/exec',
  'os/signal',
  'os/user',
  'io/ioutil',
  'net',
  'syscall',
  'plugin',
]);
const CLIENT_PACKAGES = [
  'database/sql',
  'net/http',
  'net/rpc',
  'net/smtp',
  'github.com/jackc/pgx',
  'github.com/lib/pq',
  'github.com/go-sql-driver/mysql',
  'github.com/mattn/go-sqlite3',
  'github.com/jmoiron/sqlx',
  'gorm.io/gorm',
  'entgo.io/ent',
  'github.com/uptrace/bun',
  'go.mongodb.org/mongo-driver',
  'github.com/redis/go-redis',
  'github.com/go-redis/redis',
  'github.com/gomodule/redigo',
  'github.com/segmentio/kafka-go',
  'github.com/IBM/sarama',
  'github.com/Shopify/sarama',
  'github.com/confluentinc/confluent-kafka-go',
  'github.com/rabbitmq/amqp091-go',
  'github.com/streadway/amqp',
  'github.com/nats-io/nats.go',
  'github.com/elastic/go-elasticsearch',
  'github.com/gocql/gocql',
  'github.com/go-resty/resty',
  'google.golang.org/grpc',
  'github.com/aws/aws-sdk-go',
  'github.com/aws/aws-sdk-go-v2',
  'cloud.google.com/go',
];
const LOGGER_PACKAGES = [
  'log',
  'log/slog',
  'log/syslog',
  'go.uber.org/zap',
  'github.com/sirupsen/logrus',
  'github.com/rs/zerolog',
  'github.com/go-kit/log',
  'github.com/hashicorp/go-hclog',
  'github.com/go-logr/logr',
];
const RANDOM_PACKAGES = [
  'math/rand',
  'math/rand/v2',
  'crypto/rand',
  'github.com/brianvoe/gofakeit',
  'github.com/jaswdr/faker',
];
const RANDOM_UUID = /^New(?!SHA1|MD5|Hash|V3|V5|DCE)/u;
const ID_GENERATORS = new Map([
  ['github.com/google/uuid', RANDOM_UUID],
  ['github.com/gofrs/uuid', RANDOM_UUID],
  ['github.com/satori/go.uuid', RANDOM_UUID],
  ['github.com/oklog/ulid', /^(?:Make|New|MustNew)/u],
  ['github.com/rs/xid', /^New/u],
  ['github.com/segmentio/ksuid', /^New/u],
]);

const VALUE_NAMES = new Map([
  ['os', /^(?:Err\w+|PathSeparator|PathListSeparator|DevNull|ModeDir|ModePerm|FileMode)$/u],
  [
    'net',
    /^(?:IP|IPv4|IPv4Mask|IPv6\w+|IPMask|IPNet|ParseIP|ParseCIDR|CIDRMask|HardwareAddr|ParseMAC)$/u,
  ],
  [
    'database/sql',
    /^(?:Null\w*|ErrNoRows|ErrTxDone|ErrConnDone|IsolationLevel|Level\w+|TxOptions)$/u,
  ],
  ['net/http', /^(?:Status\w*|Method\w+|Header|CanonicalHeaderKey|TimeFormat|ParseTime)$/u],
]);

function isValueName(importPath, name) {
  return VALUE_NAMES.get(importPath)?.test(name) ?? false;
}

function within(importPath, packages) {
  return packages.some(
    (listedPath) => importPath === listedPath || importPath.startsWith(`${listedPath}/`),
  );
}

function generatorNames(importPath, names) {
  const base = [...ID_GENERATORS.keys()].find((listedPath) => within(importPath, [listedPath]));
  return base === undefined ? [] : names.filter((name) => ID_GENERATORS.get(base).test(name));
}

const WHOLE_PACKAGE_RULES = [
  [RULE_IDS.domainImportsClient, CLIENT_PACKAGES],
  [RULE_IDS.domainImportsLogger, LOGGER_PACKAGES],
  [RULE_IDS.domainImportsRandom, RANDOM_PACKAGES],
];

function wholePackageRule(importPath) {
  if (IO_PACKAGES.has(importPath)) {
    return RULE_IDS.domainImportsIo;
  }
  return WHOLE_PACKAGE_RULES.find(([, packages]) => within(importPath, packages))?.[0];
}

export function libraryConcern(importPath, names) {
  const rule = wholePackageRule(importPath);
  if (rule !== undefined) {
    const used = names.filter((name) => !isValueName(importPath, name));
    return names.length > 0 && used.length === 0
      ? undefined
      : { rule, names: [...new Set(used)].sort() };
  }
  const generators = [...new Set(generatorNames(importPath, names))].sort();
  return generators.length === 0
    ? undefined
    : { rule: RULE_IDS.domainImportsRandom, names: generators };
}
