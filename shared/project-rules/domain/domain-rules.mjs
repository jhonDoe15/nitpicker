import { FEATURE_RULE_IDS } from '../fact-rules.mjs';

export const DOMAIN_RULE_IDS = {
  domainImportsAdapter: 'domain-imports-adapter',
  domainImportsIo: 'domain-imports-io',
  domainImportsClient: 'domain-imports-client',
  domainImportsLogger: 'domain-imports-logger',
  domainImportsRandom: 'domain-imports-random',
  domainImportsFrameworkContext: 'domain-imports-framework-context',
  domainReachesIo: 'domain-reaches-io',
};

export const BOUNDARY_RULE_IDS = { ...FEATURE_RULE_IDS, ...DOMAIN_RULE_IDS };

const JVM =
  'Java and Kotlin: a production class in a package with a `domain` segment (and none of `adapter`, `adapters`, `infrastructure`, `infra`), from compiled class dependencies';

const GO =
  'Go: a production file in a folder with a `domain` segment (and none of the adapter segments), from its imports';

function enforcedBy(typescript, python, go = true) {
  return { typescript, javascript: typescript, java: true, python, kotlin: true, go };
}

export function domainRules(ids) {
  return [
    {
      id: ids.domainImportsAdapter,
      check: 'coupling',
      limit: `domain code that uses a project class in an adapter package (a package with an \`adapter\`, \`adapters\`, \`infrastructure\` or \`infra\` segment). ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-import-adapters\` (\`features/<f>/domain/\` importing \`features/<f>/adapters/\`); Python: \`io-in-domain\` (a \`domain\` folder importing a module with an \`adapters\` segment); ${GO}, a package of the module with an adapter segment`,
      enforcedBy: enforcedBy(true, true),
    },
    {
      id: ids.domainImportsIo,
      check: 'coupling',
      limit: `domain code that does file, network, thread or process work: \`java.io.File*\`, \`RandomAccessFile\`, \`java.nio.file.Files\` (a \`Path\` alone is a value), file and socket channels, \`java.net\` sockets and \`URLConnection\`, \`java.net.http\`, \`ProcessBuilder\`, \`Runtime\`, \`Thread\`, \`Timer\`, executors, Kotlin \`kotlin.io\` file functions and \`kotlin.concurrent\` threads. ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-import-node-io\`; Python: \`io-in-domain\`; ${GO}: \`os\`, \`os/exec\`, \`os/signal\`, \`os/user\`, \`io/ioutil\`, \`net\`, \`syscall\`, \`plugin\``,
      enforcedBy: enforcedBy(true, true),
    },
    {
      id: ids.domainImportsClient,
      check: 'coupling',
      limit: `domain code that uses a database, HTTP or messaging client: JDBC and \`javax.sql\`, JPA \`EntityManager*\`, \`Query\` and Hibernate sessions (not the mapping annotations), Spring \`jdbc\`, \`r2dbc\`, \`web.client\`, \`web.reactive.function.client\`, Spring Data templates and repository types, OkHttp, Apache HttpClient, Feign, Retrofit, Ktor client, Kafka, AMQP, JMS, Jedis, Lettuce, Redisson, the MongoDB, Cassandra and Elasticsearch drivers, jOOQ, Jdbi, MyBatis, the AWS SDK and Google Cloud data clients. ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-import-network-or-database-clients\`; Python: \`io-in-domain\`; ${GO}: \`database/sql\`, \`net/http\`, \`net/rpc\`, \`net/smtp\`, SQL drivers, sqlx, GORM, ent, Bun, the MongoDB, Redis, Kafka, AMQP, NATS, Elasticsearch and Cassandra clients, Resty, gRPC, the AWS and Google Cloud SDKs`,
      enforcedBy: enforcedBy(true, true),
    },
    {
      id: ids.domainImportsLogger,
      check: 'coupling',
      limit: `domain code that uses a logger: SLF4J, \`java.util.logging\`, \`System.Logger\`, Log4j, Logback, Commons Logging, JBoss Logging, kotlin-logging. ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-import-the-logger\`; Python: \`logger-in-domain\`; ${GO}: \`log\`, \`log/slog\`, \`log/syslog\`, zap, logrus, zerolog, go-kit log, hclog, logr`,
      enforcedBy: enforcedBy(true, true),
    },
    {
      id: ids.domainImportsRandom,
      check: 'coupling',
      limit: `domain code that draws random values or ids: \`Random\`, \`SecureRandom\`, \`ThreadLocalRandom\`, \`SplittableRandom\`, \`java.util.random\`, \`kotlin.random\`, Commons random utilities, ULID and UUID generator libraries, fake-data libraries, and a call to \`UUID.randomUUID()\` or \`Uuid.random()\` in the source (a \`UUID\` itself is a value). ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-import-id-libraries\`; Python: \`random-in-domain\`; ${GO}: \`math/rand\`, \`crypto/rand\`, gofakeit and faker, and the generating functions (\`New...\`) of the uuid, ULID, xid and KSUID packages, not their parse functions or types`,
      enforcedBy: enforcedBy(true, true),
    },
    {
      id: ids.domainImportsFrameworkContext,
      check: 'coupling',
      limit: `domain code that looks collaborators up in the framework container: Spring \`ApplicationContext\`, \`BeanFactory\` and their \`*Aware\` callbacks, \`Environment\`, CDI \`CDI\` and \`BeanManager\`, Micronaut \`ApplicationContext\` and \`BeanContext\`, Quarkus \`Arc\`. ${JVM}; TypeScript, JavaScript and Python have no framework container the presets know`,
      enforcedBy: enforcedBy(false, false, false),
      notApplicable: {
        go: 'Go has no framework container: dependencies are passed in by the code that builds them',
      },
    },
    {
      id: ids.domainReachesIo,
      check: 'coupling',
      limit: `domain code that depends on a project class outside the domain and adapter packages whose own project dependencies reach a class of \`domain-imports-io\`, \`domain-imports-client\` or \`domain-imports-logger\`; the message shows the path. ${JVM}; TypeScript and JavaScript: dependency-cruiser \`domain-does-not-reach-io-through-shared\`; Python: \`io-in-domain\` through project helpers (helper chains); Go does not follow helpers yet`,
      enforcedBy: enforcedBy(true, true, false),
    },
  ];
}
