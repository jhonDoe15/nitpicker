import { constructorName } from '../rules/clients.mjs';
import { group } from '../spring-types.mjs';

const CONCURRENT = 'java.util.concurrent';
const NETTY_CHANNEL = 'io.netty.channel';
const SCHEDULING = 'org.springframework.scheduling.concurrent';
const KAFKA = 'org.apache.kafka.clients';
const EXECUTORS = group([`${CONCURRENT}.Executors`]);
export const THREAD = group(['java.lang.Thread']);
const STARTED_TYPES = group(
  [
    'nio.NioEventLoopGroup',
    'epoll.EpollEventLoopGroup',
    'kqueue.KQueueEventLoopGroup',
    'DefaultEventLoopGroup',
    'MultiThreadIoEventLoopGroup',
  ].map((name) => `${NETTY_CHANNEL}.${name}`),
  ['io.netty.util.concurrent.DefaultEventExecutorGroup', 'java.util.Timer'],
);
const OWNED_TYPES = group(
  [...STARTED_TYPES],
  ['ThreadPoolExecutor', 'ScheduledThreadPoolExecutor', 'ForkJoinPool'].map(
    (name) => `${CONCURRENT}.${name}`,
  ),
  [`${SCHEDULING}.ThreadPoolTaskExecutor`, `${SCHEDULING}.ThreadPoolTaskScheduler`],
  [`${KAFKA}.consumer.KafkaConsumer`, `${KAFKA}.producer.KafkaProducer`],
  ['com.zaxxer.hikari.HikariDataSource', 'kotlinx.coroutines.CoroutineScope'],
  ['kotlinx.coroutines.MainScope'],
  ['kotlinx.coroutines.newFixedThreadPoolContext', 'kotlinx.coroutines.newSingleThreadContext'],
);
const FACTORIES = [
  [group([`${KAFKA}.admin.AdminClient`, `${KAFKA}.admin.Admin`]), ['create']],
  [
    group(['com.mongodb.client.MongoClients', 'com.mongodb.reactivestreams.client.MongoClients']),
    ['create'],
  ],
  [
    group([
      'org.apache.hc.client5.http.impl.classic.HttpClients',
      'org.apache.hc.client5.http.impl.async.HttpAsyncClients',
      'org.apache.http.impl.client.HttpClients',
    ]),
    ['createDefault', 'createSystem', 'createMinimal'],
  ],
  [group(['java.sql.DriverManager']), ['getConnection']],
];
const CALL_TEXT = /^(?:(?<receiver>[\w.]+)\.)?(?<name>\w+)\s*(?:<[^(]*>)?\(/u;

function created(view, call) {
  const name = constructorName(call);
  if (name !== undefined && view.is(name, OWNED_TYPES)) {
    return true;
  }
  if (call.receiver === undefined) {
    return false;
  }
  if (view.is(call.receiver, EXECUTORS)) {
    return call.name.startsWith('new');
  }
  return FACTORIES.some(
    ([types, names]) => names.includes(call.name) && view.is(call.receiver, types),
  );
}

function callOf(text) {
  const match = CALL_TEXT.exec(text ?? '');
  return match === null ? undefined : { ...match.groups };
}

export function ownsCall(view, invocation) {
  if (invocation.assign === true || invocation.reference === true) {
    return false;
  }
  return (
    created(view, invocation) ||
    (invocation.arguments ?? []).some((argument) => {
      const call = callOf(argument.text);
      return call !== undefined && created(view, call);
    })
  );
}

export function startsThreads(view, invocation) {
  const name = constructorName(invocation);
  return name !== undefined && view.is(name, STARTED_TYPES);
}

export function constructsThread(view, invocation) {
  const name = constructorName(invocation);
  return name !== undefined && view.is(name, THREAD);
}
