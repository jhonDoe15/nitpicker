function words(text) {
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

const STATIC_EFFECTS = new Map([
  ['java.sql.DriverManager', ['getConnection']],
  ['jakarta.persistence.Persistence', ['createEntityManagerFactory']],
  ['javax.persistence.Persistence', ['createEntityManagerFactory']],
  ['com.mongodb.client.MongoClients', ['create']],
  ['com.mongodb.reactivestreams.client.MongoClients', ['create']],
  ['java.net.InetAddress', ['getByName', 'getAllByName', 'getLocalHost']],
  ['java.nio.channels.SocketChannel', ['open(+)']],
  ['java.nio.file.Files', ['*']],
  ['java.nio.channels.FileChannel', ['open']],
  ['java.io.File', ['createTempFile']],
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

const INSTANCE_EFFECTS = new Map([
  ['javax.sql.DataSource', ['getConnection']],
  ['com.zaxxer.hikari.HikariDataSource', ['getConnection']],
  ['java.net.http.HttpClient', ['send', 'sendAsync']],
  ['java.net.URL', ['openConnection', 'openStream', 'getContent', 'readText', 'readBytes']],
  ['java.net.Socket', ['connect']],
  ['java.lang.ProcessBuilder', ['start']],
  ['java.lang.Runtime', ['addShutdownHook', 'exit', 'halt']],
  ['java.lang.Thread.Builder', ['start']],
  ['java.util.concurrent.Executor', ['execute']],
  ['java.util.concurrent.ExecutorService', SUBMIT],
  ['java.util.concurrent.ScheduledExecutorService', SCHEDULE],
  ['java.util.concurrent.ForkJoinPool', [...SUBMIT, 'invoke']],
  ['java.util.Timer', ['schedule', 'scheduleAtFixedRate']],
  ['java.io.File', [...FILE_METHODS, ...FILE_IO]],
  ['java.nio.file.Path', [...PATH_METHODS, ...FILE_IO]],
  ['io.lettuce.core.RedisClient', ['connect']],
  ['io.lettuce.core.cluster.RedisClusterClient', ['connect']],
  ['okhttp3.Call', ['execute', 'enqueue']],
  ['retrofit2.Call', ['execute', 'enqueue']],
  ['org.apache.http.client.HttpClient', ['execute']],
  ['org.apache.hc.client5.http.classic.HttpClient', ['execute']],
  ['org.apache.hc.client5.http.async.HttpAsyncClient', ['execute']],
  ['org.springframework.web.client.RestOperations', REST_OPERATIONS],
  ['kotlinx.coroutines.CoroutineScope', ['launch', 'async', 'produce']],
]);

const CHAIN_EFFECTS = new Map([
  ['okhttp3.OkHttpClient', ['execute', 'enqueue']],
  ['retrofit2.Retrofit', ['execute', 'enqueue']],
  ['org.springframework.web.client.RestTemplate', REST_OPERATIONS],
  ['org.springframework.web.client.RestClient', ['retrieve', 'exchange']],
  ['org.springframework.web.reactive.function.client.WebClient', BLOCKING],
  ['org.apache.hc.client5.http.impl.classic.CloseableHttpClient', ['execute']],
  ['org.apache.http.impl.client.CloseableHttpClient', ['execute']],
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
  ['java.util.concurrent.ForkJoinPool', 'any'],
  ['org.apache.kafka.clients.producer.KafkaProducer', 'any'],
  ['java.net.Socket', 'arguments'],
  ['java.net.ServerSocket', 'arguments'],
  ['com.zaxxer.hikari.HikariDataSource', 'arguments'],
  ['java.io.PrintWriter', 'file-name'],
  ['java.io.PrintStream', 'file-name'],
  ['java.util.Formatter', 'file-name'],
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
  ['java.nio.file.Path#of', 'java.nio.file.Path'],
  ['java.nio.file.Paths#get', 'java.nio.file.Path'],
  ['java.nio.file.Path#resolve', 'java.nio.file.Path'],
  ['java.nio.file.Path#toFile', 'java.io.File'],
  ['java.io.File#toPath', 'java.nio.file.Path'],
  ['java.io.File#resolve', 'java.io.File'],
  ['java.net.URI#create', 'java.net.URI'],
  ['java.net.URI#toURL', 'java.net.URL'],
  [
    'java.util.concurrent.Executors#newSingleThreadScheduledExecutor',
    'java.util.concurrent.ScheduledExecutorService',
  ],
  ['java.util.concurrent.Executors#newScheduled*', 'java.util.concurrent.ScheduledExecutorService'],
  ['java.util.concurrent.Executors#new*', 'java.util.concurrent.ExecutorService'],
  ['java.util.concurrent.ForkJoinPool#commonPool', 'java.util.concurrent.ForkJoinPool'],
  ['java.lang.Thread#ofVirtual', 'java.lang.Thread.Builder'],
  ['java.lang.Thread#ofPlatform', 'java.lang.Thread.Builder'],
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
  ['kotlinx.coroutines.CoroutineScope', 'kotlinx.coroutines.CoroutineScope'],
  ['kotlinx.coroutines.MainScope', 'kotlinx.coroutines.CoroutineScope'],
]);

const factoryOwners = [...FACTORIES.keys()].map((key) => key.split('#')[0]);

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

function matchesMethod(entries, name, argumentCount) {
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

export function factoryResult(type, name) {
  const exact = FACTORIES.get(`${type}#${name}`);
  if (exact !== undefined) {
    return exact;
  }
  return [...FACTORIES].find(
    ([key]) => key.endsWith('*') && `${type}#${name}`.startsWith(key.slice(0, -1)),
  )?.[1];
}

const EFFECT_TABLES = new Map([
  ['static', STATIC_EFFECTS],
  ['instance', INSTANCE_EFFECTS],
  ['chain', CHAIN_EFFECTS],
]);

export function hasEffect(table, type, { name, argumentCount }) {
  return matchesMethod(EFFECT_TABLES.get(table).get(type), name, argumentCount);
}

export function isKnownType(name) {
  return KNOWN_TYPES.has(name);
}

export function kotlinPairs() {
  const tables = [STATIC_EFFECTS, INSTANCE_EFFECTS, CHAIN_EFFECTS];
  return [
    ...tables.flatMap((table) =>
      [...table].flatMap(([type, methods]) => methods.map((method) => `${type}#${method}`)),
    ),
    ...[...CONSTRUCTOR_EFFECTS.keys()].map((type) => `${type}#new`),
    ...[...TOP_LEVEL_EFFECTS].map((name) => name.replace(/\.(?=[^.]+$)/u, '#')),
  ];
}

export function isTopLevelEffect(name) {
  return TOP_LEVEL_EFFECTS.has(name);
}

export function constructorKind(type) {
  return CONSTRUCTOR_EFFECTS.get(type);
}

export function createdType(type) {
  return FACTORIES.get(type) ?? type;
}

export function isImportBanned(type) {
  return IMPORT_BANNED.has(type);
}

export function kotlinCovers(type, method) {
  if (method === 'new') {
    return CONSTRUCTOR_EFFECTS.has(type);
  }
  return [STATIC_EFFECTS, INSTANCE_EFFECTS, CHAIN_EFFECTS].some((table) =>
    matchesMethod(table.get(type), method, 1),
  );
}
