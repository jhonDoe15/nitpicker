const GET_CONNECTION = 'getConnection';
const CONNECT = 'connect';
const EXECUTE = 'execute';
const ENQUEUE = 'enqueue';
const ARGUMENTS = 'arguments';
const FILE_NAME = 'file-name';
const PATH_TYPE = 'java.nio.file.Path';
const FILE_TYPE = 'java.io.File';
const SCHEDULED_EXECUTOR = 'java.util.concurrent.ScheduledExecutorService';
const FORK_JOIN_POOL = 'java.util.concurrent.ForkJoinPool';
const THREAD_BUILDER = 'java.lang.Thread.Builder';

const COROUTINE_SCOPE = 'kotlinx.coroutines.CoroutineScope';
function words(text: string): string[] {
  return text.trim().split(/\s+/u);
}

const REST_OPERATIONS = words(`
  getForObject getForEntity headForHeaders postForLocation postForObject postForEntity put
  patchForObject delete optionsForAllow exchange execute
`);
const BLOCKING = words('block blockOptional blockFirst blockLast subscribe toFuture');
const SUBMIT = words('submit execute invokeAll invokeAny');
const SCHEDULE = [...SUBMIT, ...words('schedule scheduleAtFixedRate scheduleWithFixedDelay')];
const FILE_IO = words(`
  readText readLines readBytes writeText writeLines writeBytes appendText appendLines appendBytes
  forEachLine useLines bufferedReader bufferedWriter inputStream outputStream reader writer
  printWriter copyTo copyRecursively deleteRecursively walk walkTopDown walkBottomUp
`);
const FILE_METHODS = words(`
  createNewFile delete deleteOnExit mkdir mkdirs renameTo list listFiles exists isFile isDirectory
  length lastModified canRead canWrite
`);
const PATH_METHODS = words(`
  exists notExists isRegularFile isDirectory createFile createDirectory createDirectories
  createParentDirectories deleteExisting deleteIfExists moveTo listDirectoryEntries fileSize
  getLastModifiedTime readAttributes
`);

const STATIC_EFFECTS = new Map<string, string[]>([
  ['java.sql.DriverManager', [GET_CONNECTION]],
  ['jakarta.persistence.Persistence', ['createEntityManagerFactory']],
  ['javax.persistence.Persistence', ['createEntityManagerFactory']],
  ['com.mongodb.client.MongoClients', ['create']],
  ['com.mongodb.reactivestreams.client.MongoClients', ['create']],
  ['java.net.InetAddress', ['getByName', 'getAllByName', 'getLocalHost']],
  ['java.nio.channels.SocketChannel', ['open(+)']],
  ['java.nio.file.Files', ['*']],
  ['java.nio.channels.FileChannel', ['open']],
  [FILE_TYPE, ['createTempFile']],
  ['java.util.concurrent.Executors', ['new*']],
  ['java.util.concurrent.CompletableFuture', ['runAsync', 'supplyAsync']],
  ['java.lang.Thread', ['startVirtualThread', 'setDefaultUncaughtExceptionHandler']],
  [
    'java.lang.System',
    ['setProperty', 'setProperties', 'clearProperty', 'setOut', 'setErr', 'setIn', 'exit'],
  ],
  ['java.util.Locale', ['setDefault']],
  ['java.util.TimeZone', ['setDefault']],
  ['java.lang.ProcessBuilder', ['startPipeline']],
]);

const IMPORT_BANNED = new Set(['java.util.TimeZone']);

const INSTANCE_EFFECTS = new Map<string, string[]>([
  ['javax.sql.DataSource', [GET_CONNECTION]],
  ['com.zaxxer.hikari.HikariDataSource', [GET_CONNECTION]],
  ['java.net.http.HttpClient', ['send', 'sendAsync']],
  ['java.net.URL', ['openConnection', 'openStream', 'getContent', 'readText', 'readBytes']],
  ['java.net.Socket', [CONNECT]],
  ['java.lang.ProcessBuilder', ['start']],
  ['java.lang.Runtime', ['addShutdownHook', 'exit', 'halt']],
  [THREAD_BUILDER, ['start']],
  ['java.util.concurrent.Executor', [EXECUTE]],
  ['java.util.concurrent.ExecutorService', SUBMIT],
  [SCHEDULED_EXECUTOR, SCHEDULE],
  [FORK_JOIN_POOL, [...SUBMIT, 'invoke']],
  ['java.util.Timer', ['schedule', 'scheduleAtFixedRate']],
  [FILE_TYPE, [...FILE_METHODS, ...FILE_IO]],
  [PATH_TYPE, [...PATH_METHODS, ...FILE_IO]],
  ['io.lettuce.core.RedisClient', [CONNECT]],
  ['io.lettuce.core.cluster.RedisClusterClient', [CONNECT]],
  ['okhttp3.Call', [EXECUTE, ENQUEUE]],
  ['retrofit2.Call', [EXECUTE, ENQUEUE]],
  ['org.apache.http.client.HttpClient', [EXECUTE]],
  ['org.apache.hc.client5.http.classic.HttpClient', [EXECUTE]],
  ['org.apache.hc.client5.http.async.HttpAsyncClient', [EXECUTE]],
  ['org.springframework.web.client.RestOperations', REST_OPERATIONS],
  [COROUTINE_SCOPE, ['launch', 'async', 'produce']],
]);

const CHAIN_EFFECTS = new Map<string, string[]>([
  ['okhttp3.OkHttpClient', [EXECUTE, ENQUEUE]],
  ['retrofit2.Retrofit', [EXECUTE, ENQUEUE]],
  ['org.springframework.web.client.RestTemplate', REST_OPERATIONS],
  ['org.springframework.web.client.RestClient', ['retrieve', 'exchange']],
  ['org.springframework.web.reactive.function.client.WebClient', BLOCKING],
  ['org.apache.hc.client5.http.impl.classic.CloseableHttpClient', [EXECUTE]],
  ['org.apache.http.impl.client.CloseableHttpClient', [EXECUTE]],
]);

const CONSTRUCTOR_EFFECTS = new Map([
  ['java.io.FileInputStream', 'any'],
  ['java.io.FileOutputStream', 'any'],
  ['java.io.FileReader', 'any'],
  ['java.io.FileWriter', 'any'],
  ['java.io.RandomAccessFile', 'any'],
  ['java.util.zip.ZipFile', 'any'],
  ['java.util.jar.JarFile', 'any'],
  ['java.net.DatagramSocket', 'any'],
  ['java.net.MulticastSocket', 'any'],
  ['java.util.Timer', 'any'],
  ['java.util.concurrent.ThreadPoolExecutor', 'any'],
  ['java.util.concurrent.ScheduledThreadPoolExecutor', 'any'],
  [FORK_JOIN_POOL, 'any'],
  ['org.apache.kafka.clients.producer.KafkaProducer', 'any'],
  ['java.net.Socket', ARGUMENTS],
  ['java.net.ServerSocket', ARGUMENTS],
  ['com.zaxxer.hikari.HikariDataSource', ARGUMENTS],
  ['java.io.PrintWriter', FILE_NAME],
  ['java.io.PrintStream', FILE_NAME],
  ['java.util.Formatter', FILE_NAME],
  ['java.util.Scanner', 'file'],
]);

const TOP_LEVEL_EFFECTS = new Set([
  'kotlin.system.exitProcess',
  'kotlin.concurrent.timer',
  'kotlin.concurrent.fixedRateTimer',
]);

const FACTORIES = new Map([
  ['java.net.http.HttpClient#newHttpClient', 'java.net.http.HttpClient'],
  ['java.net.http.HttpClient#newBuilder', 'java.net.http.HttpClient.Builder'],
  ['java.lang.Runtime#getRuntime', 'java.lang.Runtime'],
  ['java.nio.file.Path#of', PATH_TYPE],
  ['java.nio.file.Paths#get', PATH_TYPE],
  ['java.nio.file.Path#resolve', PATH_TYPE],
  ['java.nio.file.Path#toFile', FILE_TYPE],
  ['java.io.File#toPath', PATH_TYPE],
  ['java.io.File#resolve', FILE_TYPE],
  ['java.net.URI#create', 'java.net.URI'],
  ['java.net.URI#toURL', 'java.net.URL'],
  ['java.util.concurrent.Executors#newSingleThreadScheduledExecutor', SCHEDULED_EXECUTOR],
  ['java.util.concurrent.Executors#newScheduled*', SCHEDULED_EXECUTOR],
  ['java.util.concurrent.Executors#new*', 'java.util.concurrent.ExecutorService'],
  ['java.util.concurrent.ForkJoinPool#commonPool', FORK_JOIN_POOL],
  ['java.lang.Thread#ofVirtual', THREAD_BUILDER],
  ['java.lang.Thread#ofPlatform', THREAD_BUILDER],
  ['io.lettuce.core.RedisClient#create', 'io.lettuce.core.RedisClient'],
  [
    'io.lettuce.core.cluster.RedisClusterClient#create',
    'io.lettuce.core.cluster.RedisClusterClient',
  ],
  ['org.springframework.web.client.RestClient#create', 'org.springframework.web.client.RestClient'],
  [
    'org.springframework.web.client.RestClient#builder',
    'org.springframework.web.client.RestClient.Builder',
  ],
  [
    'org.springframework.web.reactive.function.client.WebClient#create',
    'org.springframework.web.reactive.function.client.WebClient',
  ],
  [
    'org.springframework.web.reactive.function.client.WebClient#builder',
    'org.springframework.web.reactive.function.client.WebClient.Builder',
  ],
  [
    'org.apache.hc.client5.http.impl.classic.HttpClients#createDefault',
    'org.apache.hc.client5.http.impl.classic.CloseableHttpClient',
  ],
  [
    'org.apache.http.impl.client.HttpClients#createDefault',
    'org.apache.http.impl.client.CloseableHttpClient',
  ],
  [COROUTINE_SCOPE, COROUTINE_SCOPE],
  ['kotlinx.coroutines.MainScope', COROUTINE_SCOPE],
]);

const factoryOwners = [...FACTORIES.keys()].flatMap((key) => key.split('#').slice(0, 1));

const KNOWN_TYPES = new Set([
  ...STATIC_EFFECTS.keys(),
  ...INSTANCE_EFFECTS.keys(),
  ...CHAIN_EFFECTS.keys(),
  ...CONSTRUCTOR_EFFECTS.keys(),
  ...FACTORIES.values(),
  ...factoryOwners,
  'org.springframework.web.client.RestTemplate',
  'okhttp3.OkHttpClient',
  'retrofit2.Retrofit',
]);

function matchesMethod(
  entries: readonly string[] | undefined,
  name: string,
  argumentCount: number,
): boolean {
  return (entries ?? []).some((entry) => {
    if (entry === '*') {
      return true;
    }
    if (entry.endsWith('(+)')) {
      return entry.slice(0, -'(+)'.length) === name && argumentCount > 0;
    }
    return entry.endsWith('*') ? name.startsWith(entry.slice(0, -1)) : entry === name;
  });
}

export function factoryResult(type: string, name: string): string | undefined {
  const exact = FACTORIES.get(`${type}#${name}`);
  if (exact !== undefined) {
    return exact;
  }
  return [...FACTORIES].find(
    ([key]) => key.endsWith('*') && `${type}#${name}`.startsWith(key.slice(0, -1)),
  )?.[1];
}

const EFFECT_TABLES = new Map<string, Map<string, string[]>>([
  ['static', STATIC_EFFECTS],
  ['instance', INSTANCE_EFFECTS],
  ['chain', CHAIN_EFFECTS],
]);

export function hasEffect(
  table: string,
  type: string | undefined,
  { name, argumentCount }: { name: string; argumentCount: number },
): boolean {
  return matchesMethod(
    type === undefined ? undefined : EFFECT_TABLES.get(table)?.get(type),
    name,
    argumentCount,
  );
}

export function isKnownType(name: string): boolean {
  return KNOWN_TYPES.has(name);
}

export function kotlinPairs(): string[] {
  const tables = [STATIC_EFFECTS, INSTANCE_EFFECTS, CHAIN_EFFECTS];
  return [
    ...tables.flatMap((table) =>
      [...table].flatMap(([type, methods]) => methods.map((method) => `${type}#${method}`)),
    ),
    ...[...CONSTRUCTOR_EFFECTS.keys()].map((type) => `${type}#new`),
    ...[...TOP_LEVEL_EFFECTS].map((name) => name.replace(/\.(?=[^.]+$)/u, '#')),
  ];
}

export function isTopLevelEffect(name: string): boolean {
  return TOP_LEVEL_EFFECTS.has(name);
}

export function constructorKind(type: string): string | undefined {
  return CONSTRUCTOR_EFFECTS.get(type);
}

export function createdType(type: string): string {
  return FACTORIES.get(type) ?? type;
}

export function isImportBanned(type: string): boolean {
  return IMPORT_BANNED.has(type);
}

export function kotlinCovers(type: string, method: string): boolean {
  if (method === 'new') {
    return CONSTRUCTOR_EFFECTS.has(type);
  }
  return [STATIC_EFFECTS, INSTANCE_EFFECTS, CHAIN_EFFECTS].some((table) =>
    matchesMethod(table.get(type), method, 1),
  );
}
