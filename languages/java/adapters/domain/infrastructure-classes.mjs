import { RULE_IDS } from '../../../../shared/policy.mjs';

const JPA = ['jakarta.persistence', 'javax.persistence'].flatMap((root) =>
  [
    'EntityManager',
    'EntityManagerFactory',
    'Persistence',
    'Query',
    'TypedQuery',
    'StoredProcedureQuery',
    'EntityTransaction',
  ].map((name) => `${root}.${name}`),
);

const IO_CLASSES = [
  'java.io.File',
  'java.io.FileInputStream',
  'java.io.FileOutputStream',
  'java.io.FileReader',
  'java.io.FileWriter',
  'java.io.RandomAccessFile',
  'java.io.FileDescriptor',
  'java.nio.file.Files',
  'java.nio.file.FileSystems',
  'java.nio.file.WatchService',
  'java.nio.channels.FileChannel',
  'java.nio.channels.AsynchronousFileChannel',
  'java.nio.channels.SocketChannel',
  'java.nio.channels.ServerSocketChannel',
  'java.nio.channels.DatagramChannel',
  'java.lang.ProcessBuilder',
  'java.lang.Process',
  'java.lang.Runtime',
  'java.lang.Thread',
  'java.util.Timer',
  'java.util.concurrent.Executors',
  'java.util.concurrent.ExecutorService',
  'java.util.concurrent.ScheduledExecutorService',
  'java.util.concurrent.ThreadPoolExecutor',
  'java.util.concurrent.ScheduledThreadPoolExecutor',
  'java.util.concurrent.ForkJoinPool',
  'java.net.Socket',
  'java.net.ServerSocket',
  'java.net.DatagramSocket',
  'java.net.URLConnection',
  'java.net.HttpURLConnection',
  'java.net.InetAddress',
  'kotlin.concurrent.ThreadsKt',
  'kotlin.concurrent.TimersKt',
];
const IO_PACKAGES = ['java.net.http', 'kotlin.io.FilesKt', 'kotlin.io.path.PathsKt'];

const CLIENT_CLASSES = [
  ...JPA,
  'java.sql.Connection',
  'java.sql.DriverManager',
  'java.sql.Statement',
  'java.sql.PreparedStatement',
  'java.sql.CallableStatement',
  'java.sql.ResultSet',
  'javax.sql.DataSource',
  'org.hibernate.Session',
  'org.hibernate.SessionFactory',
  'org.hibernate.StatelessSession',
];
const CLIENT_PACKAGES = [
  'org.springframework.jdbc',
  'org.springframework.r2dbc',
  'org.springframework.web.client',
  'org.springframework.web.reactive.function.client',
  'org.springframework.data.jdbc.core',
  'org.springframework.data.r2dbc.core',
  'org.springframework.data.mongodb.core',
  'org.springframework.data.redis.core',
  'org.springframework.data.elasticsearch.client',
  'org.springframework.kafka.core',
  'org.springframework.amqp',
  'org.springframework.jms',
  'okhttp3',
  'com.squareup.okhttp',
  'org.apache.http',
  'org.apache.hc',
  'feign',
  'retrofit2',
  'io.ktor.client',
  'org.asynchttpclient',
  'reactor.netty.http.client',
  'io.vertx.ext.web.client',
  'org.apache.kafka.clients',
  'com.rabbitmq.client',
  'jakarta.jms',
  'javax.jms',
  'redis.clients.jedis',
  'io.lettuce.core',
  'org.redisson',
  'com.mongodb',
  'software.amazon.awssdk',
  'com.amazonaws',
  'com.datastax.oss.driver',
  'org.elasticsearch.client',
  'co.elastic.clients',
  'io.r2dbc.spi',
  'org.jooq',
  'org.jdbi.v3',
  'com.zaxxer.hikari',
  'org.mybatis',
  'org.apache.ibatis',
  'com.google.cloud.storage',
  'com.google.cloud.pubsub',
  'com.google.cloud.firestore',
  'com.google.cloud.bigquery',
  'com.google.cloud.spanner',
  'com.google.cloud.datastore',
];

const LOGGER_CLASSES = ['java.lang.System$Logger', 'java.lang.System$LoggerFinder'];
const LOGGER_PACKAGES = [
  'org.slf4j',
  'java.util.logging',
  'org.apache.logging.log4j',
  'org.apache.log4j',
  'ch.qos.logback',
  'org.apache.commons.logging',
  'org.jboss.logging',
  'io.github.oshai.kotlinlogging',
  'mu',
];

const RANDOM_CLASSES = [
  'java.util.Random',
  'java.security.SecureRandom',
  'java.util.concurrent.ThreadLocalRandom',
  'java.util.SplittableRandom',
  'kotlin.random.Random',
  'kotlin.random.RandomKt',
  'kotlin.random.PlatformRandomKt',
  'org.apache.commons.lang3.RandomStringUtils',
  'org.apache.commons.lang3.RandomUtils',
  'org.apache.commons.text.RandomStringGenerator',
];
const RANDOM_PACKAGES = [
  'java.util.random',
  'com.github.f4b6a3.ulid',
  'com.github.f4b6a3.uuid',
  'com.fasterxml.uuid',
  'de.huxhorn.sulky.ulid',
  'io.azam.ulidj',
  'net.datafaker',
  'com.github.javafaker',
];

const CONTEXT_CLASSES = [
  'org.springframework.context.ApplicationContext',
  'org.springframework.context.ConfigurableApplicationContext',
  'org.springframework.context.ApplicationContextAware',
  'org.springframework.beans.factory.BeanFactory',
  'org.springframework.beans.factory.ListableBeanFactory',
  'org.springframework.beans.factory.BeanFactoryAware',
  'org.springframework.core.env.Environment',
  'jakarta.enterprise.inject.spi.CDI',
  'jakarta.enterprise.inject.spi.BeanManager',
  'javax.enterprise.inject.spi.CDI',
  'javax.enterprise.inject.spi.BeanManager',
  'io.micronaut.context.ApplicationContext',
  'io.micronaut.context.BeanContext',
  'io.quarkus.arc.Arc',
];

const DOMAIN_CONCERNS = [
  { rule: RULE_IDS.domainImportsIo, classes: IO_CLASSES, packages: IO_PACKAGES, reach: true },
  {
    rule: RULE_IDS.domainImportsClient,
    classes: CLIENT_CLASSES,
    packages: CLIENT_PACKAGES,
    reach: true,
  },
  {
    rule: RULE_IDS.domainImportsLogger,
    classes: LOGGER_CLASSES,
    packages: LOGGER_PACKAGES,
    reach: true,
  },
  { rule: RULE_IDS.domainImportsRandom, classes: RANDOM_CLASSES, packages: RANDOM_PACKAGES },
  { rule: RULE_IDS.domainImportsFrameworkContext, classes: CONTEXT_CLASSES, packages: [] },
];

function outer(className) {
  return className.split('$')[0];
}

function inPackage(className, packageName) {
  return (
    className === packageName ||
    className.startsWith(`${packageName}.`) ||
    className.startsWith(`${packageName}__`)
  );
}

function isSpringDataRepository(className) {
  return className.startsWith('org.springframework.data.') && className.includes('.repository.');
}

function matches(concern, className) {
  return (
    concern.classes.includes(className) ||
    concern.classes.includes(outer(className)) ||
    concern.packages.some((packageName) => inPackage(className, packageName)) ||
    (concern.rule === RULE_IDS.domainImportsClient && isSpringDataRepository(className))
  );
}

export function concernOf(className) {
  return DOMAIN_CONCERNS.find((concern) => matches(concern, className));
}
