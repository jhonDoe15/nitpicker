import {
  AXIOS_MODULES,
  FETCH_MODULES,
  GOT_METHODS,
  GOT_MODULES,
  HTTP_MODULE_FUNCTIONS,
  HTTP_MODULES,
  NODE_FETCH_MODULES,
  OFETCH_MODULES,
  UNDICI_MODULES,
} from '../security/http/http-modules.mts';
import type { ClientSpec } from './io-origin.mts';

const REMOTE = 'remote';
const REQUEST = 'request';
const MESSAGE = 'message';
const DEFAULT = 'default';
const PUBLISH = 'publish';
const CONNECT = 'connect';
const HTTP_METHODS = [
  REQUEST,
  'get',
  'delete',
  'head',
  'options',
  'post',
  'put',
  'patch',
  'postForm',
  'putForm',
  'patchForm',
];
const BODY_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'];
const FETCH_FUNCTIONS = ['fetch', 'ofetch', '$fetch'];
const REDIS_PUBLISH = [PUBLISH, 'spublish', 'sPublish'];
const MESSAGE_SERVICES = /client-(?:sqs|sns|eventbridge|kinesis|firehose)$/u;
const DATABASE_SERVICES = /client-dynamodb$/u;

function client(kind: ClientSpec['kind'], spec: Partial<ClientSpec>): ClientSpec {
  return {
    kind,
    callable: false,
    deep: false,
    methods: new Set<string>(),
    makers: new Set(),
    types: new Set(),
    functions: new Set(),
    derivers: new Set(),
    ...spec,
  };
}

function amqpClient(derivers: readonly string[], types: readonly string[]): ClientSpec {
  return client(MESSAGE, {
    methods: new Set([PUBLISH, 'sendToQueue']),
    makers: new Set([CONNECT]),
    derivers: new Set(derivers),
    types: new Set(types),
  });
}

function redisClient(makers: readonly string[], types: readonly string[]): ClientSpec {
  return client(MESSAGE, {
    methods: new Set(REDIS_PUBLISH),
    makers: new Set(makers),
    types: new Set(types),
  });
}

const SPECS = new Map<string, ClientSpec>([
  ...AXIOS_MODULES.map((name): [string, ClientSpec] => [
    name,
    client(REMOTE, {
      callable: true,
      methods: new Set(HTTP_METHODS),
      makers: new Set(['create']),
      types: new Set(['AxiosInstance', 'AxiosStatic']),
    }),
  ]),
  ...GOT_MODULES.map((name): [string, ClientSpec] => [
    name,
    client(REMOTE, {
      callable: true,
      methods: new Set([...GOT_METHODS, 'paginate']),
      makers: new Set(['extend']),
      types: new Set(['Got']),
    }),
  ]),
  [
    'ky',
    client(REMOTE, {
      callable: true,
      methods: new Set(BODY_METHODS),
      makers: new Set(['create', 'extend']),
      types: new Set(['KyInstance']),
    }),
  ],
  [
    'superagent',
    client(REMOTE, {
      callable: true,
      methods: new Set(BODY_METHODS),
      makers: new Set(['agent']),
    }),
  ],
  ['needle', client(REMOTE, { callable: true, methods: new Set([...BODY_METHODS, REQUEST]) })],
  ...UNDICI_MODULES.map((name): [string, ClientSpec] => [
    name,
    client(REMOTE, {
      functions: new Set(['fetch', REQUEST, 'stream']),
      methods: new Set([REQUEST, 'stream']),
      makers: new Set(['Client', 'Pool', 'Agent']),
      types: new Set(['Dispatcher']),
    }),
  ]),
  [
    '@nestjs/axios',
    client(REMOTE, {
      methods: new Set(BODY_METHODS.concat(REQUEST)),
      makers: new Set(['HttpService']),
      types: new Set(['HttpService']),
    }),
  ],
  [
    '@angular/common/http',
    client(REMOTE, {
      methods: new Set([...BODY_METHODS, 'options', REQUEST, 'jsonp']),
      types: new Set(['HttpClient']),
    }),
  ],
  [
    'rxjs/ajax',
    client(REMOTE, {
      callable: true,
      functions: new Set(['ajax']),
      methods: new Set([...BODY_METHODS, 'getJSON']),
    }),
  ],
  [
    'graphql-request',
    client(REMOTE, {
      functions: new Set([REQUEST, 'rawRequest']),
      methods: new Set([REQUEST, 'rawRequest']),
      makers: new Set(['GraphQLClient']),
    }),
  ],
  ['openai', client(REMOTE, { methods: '*', deep: true, makers: new Set([DEFAULT, 'OpenAI']) })],
  [
    '@anthropic-ai/sdk',
    client(REMOTE, { methods: '*', deep: true, makers: new Set([DEFAULT, 'Anthropic']) }),
  ],
  ['stripe', client(REMOTE, { methods: '*', deep: true, makers: new Set([DEFAULT, 'Stripe']) })],
  ['@octokit/rest', client(REMOTE, { methods: '*', deep: true, makers: new Set(['Octokit']) })],
  ['octokit', client(REMOTE, { methods: '*', deep: true, makers: new Set(['Octokit']) })],
  ['@slack/web-api', client(REMOTE, { methods: '*', deep: true, makers: new Set(['WebClient']) })],
  [
    'kafkajs',
    client(MESSAGE, {
      methods: new Set(['send', 'sendBatch']),
      makers: new Set(['Kafka']),
      derivers: new Set(['producer']),
      types: new Set(['Producer']),
    }),
  ],
  ['amqplib', amqpClient(['createChannel', 'createConfirmChannel'], ['Channel', 'ConfirmChannel'])],
  ['amqp-connection-manager', amqpClient(['createChannel'], ['ChannelWrapper'])],
  ['nats', client(MESSAGE, { methods: new Set([PUBLISH]), makers: new Set([CONNECT]) })],
  ['ioredis', redisClient([DEFAULT, 'Redis', 'Cluster'], ['Redis', 'Cluster'])],
  [
    'redis',
    redisClient(['createClient', 'createCluster'], ['RedisClientType', 'RedisClusterType']),
  ],
  [
    '@google-cloud/pubsub',
    client(MESSAGE, {
      methods: new Set([PUBLISH, 'publishMessage', 'publishJSON']),
      makers: new Set(['PubSub']),
      derivers: new Set(['topic']),
      types: new Set(['Topic']),
    }),
  ],
  ['bullmq', client(MESSAGE, { methods: new Set(['add', 'addBulk']), makers: new Set(['Queue']) })],
  ['bull', client(MESSAGE, { methods: new Set(['add', 'addBulk']), makers: new Set([DEFAULT]) })],
  [
    'mqtt',
    client(MESSAGE, {
      methods: new Set([PUBLISH, 'publishAsync']),
      makers: new Set([CONNECT, 'connectAsync']),
    }),
  ],
  [
    '@azure/service-bus',
    client(MESSAGE, {
      methods: new Set(['sendMessages']),
      makers: new Set(['ServiceBusClient']),
      derivers: new Set(['createSender']),
    }),
  ],
  ...[...FETCH_MODULES, ...NODE_FETCH_MODULES, ...OFETCH_MODULES].map(
    (name): [string, ClientSpec] => [
      name,
      client(REMOTE, { callable: true, functions: new Set(FETCH_FUNCTIONS) }),
    ],
  ),
  ...HTTP_MODULES.map((name): [string, ClientSpec] => [
    name,
    client(REMOTE, { functions: new Set(HTTP_MODULE_FUNCTIONS) }),
  ]),
]);

export function clientSpec(source: string): ClientSpec | undefined {
  if (source.startsWith('@aws-sdk/client-') && !DATABASE_SERVICES.test(source)) {
    return client(MESSAGE_SERVICES.test(source) ? MESSAGE : REMOTE, {
      methods: new Set(['send']),
      makerPattern: /Client$/u,
      typePattern: /Client$/u,
    });
  }
  return SPECS.get(source);
}
