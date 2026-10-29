import {
  DATA_REPOSITORIES,
  ENTITY_MANAGER,
  JDBC,
  REST_CLIENT,
  REST_OPERATIONS,
  group,
} from '../spring/spring-types.mjs';

const FILE_EXTENSIONS = [
  'readText',
  'readBytes',
  'readLines',
  'writeText',
  'writeBytes',
  'appendText',
  'appendBytes',
  'forEachLine',
  'useLines',
  'inputStream',
  'outputStream',
  'bufferedReader',
  'bufferedWriter',
  'reader',
  'writer',
  'printWriter',
  'copyTo',
  'copyRecursively',
  'deleteRecursively',
];
const FILE_MEMBERS = [
  'exists',
  'isFile',
  'isDirectory',
  'length',
  'list',
  'listFiles',
  'delete',
  'mkdir',
  'mkdirs',
  'createNewFile',
  'renameTo',
  'lastModified',
];
const PATH_EXTENSIONS = [
  ...FILE_EXTENSIONS,
  'exists',
  'isDirectory',
  'isRegularFile',
  'listDirectoryEntries',
  'deleteExisting',
  'deleteIfExists',
  'createDirectory',
  'createDirectories',
  'createFile',
  'moveTo',
  'fileSize',
  'walk',
];
const STATEMENT_METHODS = [
  'execute',
  'executeQuery',
  'executeUpdate',
  'executeBatch',
  'executeLargeUpdate',
];
const BLOCKING_QUEUES = [
  'java.util.concurrent.BlockingQueue',
  'java.util.concurrent.BlockingDeque',
  'java.util.concurrent.LinkedBlockingQueue',
  'java.util.concurrent.LinkedBlockingDeque',
  'java.util.concurrent.ArrayBlockingQueue',
  'java.util.concurrent.PriorityBlockingQueue',
  'java.util.concurrent.SynchronousQueue',
  'java.util.concurrent.LinkedTransferQueue',
  'java.util.concurrent.DelayQueue',
];
const FUTURES = [
  'java.util.concurrent.Future',
  'java.util.concurrent.CompletableFuture',
  'java.util.concurrent.FutureTask',
  'java.util.concurrent.ScheduledFuture',
  'java.util.concurrent.ForkJoinTask',
  'java.util.concurrent.CompletionStage',
];
const LOCKS = [
  'java.util.concurrent.locks.Lock',
  'java.util.concurrent.locks.ReentrantLock',
  'java.util.concurrent.locks.StampedLock',
];
const EVERY_METHOD = '*';
const REST_CLIENT_REQUESTS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'method'];
const NON_BLOCKING_DATA = /\.(?:reactive|kotlin|r2dbc)\.|\.Reactive\w*$/u;

export const STATIC_CALLS = [
  { owners: ['java.nio.file.Files'], names: EVERY_METHOD, label: 'Files' },
  { owners: ['java.sql.DriverManager'], names: ['getConnection'], label: 'DriverManager' },
  { owners: ['java.net.InetAddress'], names: ['getByName', 'getAllByName'], label: 'InetAddress' },
];

export const MEMBER_CALLS = [
  { types: ['java.io.File'], names: FILE_MEMBERS, extensions: FILE_EXTENSIONS },
  {
    types: ['java.nio.file.Path'],
    names: [],
    extensions: PATH_EXTENSIONS,
    requires: ['kotlin.io.path.'],
  },
  {
    types: ['java.net.URL'],
    names: ['openStream', 'openConnection'],
    extensions: ['readText', 'readBytes'],
  },
  {
    types: ['java.io.FileInputStream', 'java.io.RandomAccessFile'],
    names: ['read', 'readAllBytes', 'readNBytes', 'skip'],
    extensions: ['readBytes'],
  },
  { types: ['java.io.FileOutputStream'], names: ['write', 'flush'] },
  { types: ['java.io.FileReader'], names: ['read'], extensions: ['readText', 'readLines'] },
  { types: ['java.io.FileWriter'], names: ['write', 'append', 'flush'] },
  {
    types: ['java.sql.Connection'],
    names: ['prepareStatement', 'createStatement', 'prepareCall', 'commit', 'rollback'],
  },
  {
    types: ['java.sql.Statement', 'java.sql.PreparedStatement', 'java.sql.CallableStatement'],
    names: STATEMENT_METHODS,
  },
  { types: ['java.sql.ResultSet'], names: ['next'] },
  { types: ['javax.sql.DataSource'], names: ['getConnection'] },
  { types: FUTURES, names: ['get', 'join'] },
  {
    types: ['java.util.concurrent.CountDownLatch', 'java.util.concurrent.CyclicBarrier'],
    names: ['await'],
  },
  { types: BLOCKING_QUEUES, names: ['take', 'put'] },
  { types: ['java.util.concurrent.Semaphore'], names: ['acquire', 'acquireUninterruptibly'] },
  { types: LOCKS, names: ['lock', 'lockInterruptibly'] },
  { types: ['java.lang.Process'], names: ['waitFor'] },
  { types: ['java.lang.Thread'], names: ['join'] },
  { types: ['java.net.http.HttpClient'], names: ['send'] },
  {
    types: ['java.net.URLConnection', 'java.net.HttpURLConnection'],
    names: ['getInputStream', 'getOutputStream', 'getResponseCode', 'connect'],
  },
  { types: ['java.net.Socket'], names: ['connect', 'getInputStream', 'getOutputStream'] },
  { types: ['java.net.ServerSocket'], names: ['accept'] },
  { types: ['okhttp3.Call'], names: ['execute'] },
  { types: [...REST_CLIENT], names: REST_CLIENT_REQUESTS },
  { types: [...JDBC, ...REST_OPERATIONS, ...ENTITY_MANAGER], names: EVERY_METHOD },
];

export const OBJECT_METHODS = ['toString', 'equals', 'hashCode', 'getClass'];

export const EVIDENCE_CALLS = [
  {
    names: ['executeQuery', 'executeUpdate', 'executeBatch', 'executeLargeUpdate'],
    imports: [
      'java.sql.',
      'javax.sql.',
      'org.springframework.jdbc.',
      'jakarta.persistence.',
      'javax.persistence.',
    ],
  },
  {
    names: ['block', 'blockFirst', 'blockLast', 'blockOptional'],
    imports: ['reactor.core.', 'org.springframework.web.reactive.'],
  },
];

export const STANDARD_INPUT = ['readLine', 'readln', 'readlnOrNull'];

export const BLOCKING_REPOSITORIES = group(
  [...DATA_REPOSITORIES].filter((name) => !NON_BLOCKING_DATA.test(name)),
  ['org.springframework.data.repository.query.QueryByExampleExecutor'],
);
export const REACTIVE_REPOSITORIES = group(
  [...DATA_REPOSITORIES].filter((name) => NON_BLOCKING_DATA.test(name)),
);

export const NON_SUSPENDING_STANDARD = [
  'println',
  'print',
  'listOf',
  'mutableListOf',
  'mapOf',
  'mutableMapOf',
  'setOf',
  'arrayOf',
  'emptyList',
  'require',
  'check',
  'error',
  'TODO',
  'let',
  'run',
  'apply',
  'also',
  'with',
  'takeIf',
  'takeUnless',
  'use',
  'forEach',
  'forEachIndexed',
  'map',
  'filter',
  'joinToString',
  'toString',
  'repeat',
];

export const EVERY = EVERY_METHOD;
