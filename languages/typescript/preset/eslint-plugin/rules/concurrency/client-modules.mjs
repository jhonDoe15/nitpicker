const HTTP_METHODS = [
  'request',
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
const FETCH_MODULES = [
  'node-fetch',
  'cross-fetch',
  'isomorphic-fetch',
  'isomorphic-unfetch',
  'ofetch',
];
const HTTP_SERVERS = ['http', 'node:http', 'https', 'node:https'];
const MESSAGE_SERVICES = /client-(?:sqs|sns|eventbridge|kinesis|firehose)$/u;
const DATABASE_SERVICES = /client-dynamodb$/u;

function client(kind, spec) {
  return {
    kind,
    methods: new Set(),
    makers: new Set(),
    types: new Set(),
    functions: new Set(),
    derivers: new Set(),
    ...spec,
  };
}

const SPECS = new Map([
  [
    'axios',
    client('remote', {
      callable: true,
      methods: new Set(HTTP_METHODS),
      makers: new Set(['create']),
      types: new Set(['AxiosInstance', 'AxiosStatic']),
    }),
  ],
  [
    'got',
    client('remote', {
      callable: true,
      methods: new Set([...BODY_METHODS, 'stream', 'paginate']),
      makers: new Set(['extend']),
      types: new Set(['Got']),
    }),
  ],
  [
    'ky',
    client('remote', {
      callable: true,
      methods: new Set(BODY_METHODS),
      makers: new Set(['create', 'extend']),
      types: new Set(['KyInstance']),
    }),
  ],
  [
    'superagent',
    client('remote', {
      callable: true,
      methods: new Set(BODY_METHODS),
      makers: new Set(['agent']),
    }),
  ],
  ['needle', client('remote', { callable: true, methods: new Set([...BODY_METHODS, 'request']) })],
  [
    'undici',
    client('remote', {
      functions: new Set(['fetch', 'request', 'stream']),
      methods: new Set(['request', 'stream']),
      makers: new Set(['Client', 'Pool', 'Agent']),
      types: new Set(['Dispatcher']),
    }),
  ],
  [
    '@nestjs/axios',
    client('remote', {
      methods: new Set(BODY_METHODS.concat('request')),
      makers: new Set(['HttpService']),
      types: new Set(['HttpService']),
    }),
  ],
  [
    'graphql-request',
    client('remote', {
      functions: new Set(['request', 'rawRequest']),
      methods: new Set(['request', 'rawRequest']),
      makers: new Set(['GraphQLClient']),
    }),
  ],
  [
    'openai',
    client('remote', { methods: '*', deep: true, makers: new Set(['default', 'OpenAI']) }),
  ],
  [
    '@anthropic-ai/sdk',
    client('remote', { methods: '*', deep: true, makers: new Set(['default', 'Anthropic']) }),
  ],
  [
    'stripe',
    client('remote', { methods: '*', deep: true, makers: new Set(['default', 'Stripe']) }),
  ],
  ['@octokit/rest', client('remote', { methods: '*', deep: true, makers: new Set(['Octokit']) })],
  ['octokit', client('remote', { methods: '*', deep: true, makers: new Set(['Octokit']) })],
  [
    '@slack/web-api',
    client('remote', { methods: '*', deep: true, makers: new Set(['WebClient']) }),
  ],
  [
    'kafkajs',
    client('message', {
      methods: new Set(['send', 'sendBatch']),
      makers: new Set(['Kafka']),
      derivers: new Set(['producer']),
      types: new Set(['Producer']),
    }),
  ],
  [
    'amqplib',
    client('message', {
      methods: new Set(['publish', 'sendToQueue']),
      makers: new Set(['connect']),
      derivers: new Set(['createChannel', 'createConfirmChannel']),
      types: new Set(['Channel', 'ConfirmChannel']),
    }),
  ],
  [
    'amqp-connection-manager',
    client('message', {
      methods: new Set(['publish', 'sendToQueue']),
      makers: new Set(['connect']),
      derivers: new Set(['createChannel']),
      types: new Set(['ChannelWrapper']),
    }),
  ],
  ['nats', client('message', { methods: new Set(['publish']), makers: new Set(['connect']) })],
  [
    '@google-cloud/pubsub',
    client('message', {
      methods: new Set(['publish', 'publishMessage', 'publishJSON']),
      makers: new Set(['PubSub']),
      derivers: new Set(['topic']),
      types: new Set(['Topic']),
    }),
  ],
  [
    'bullmq',
    client('message', { methods: new Set(['add', 'addBulk']), makers: new Set(['Queue']) }),
  ],
  [
    'bull',
    client('message', { methods: new Set(['add', 'addBulk']), makers: new Set(['default']) }),
  ],
  [
    'mqtt',
    client('message', {
      methods: new Set(['publish', 'publishAsync']),
      makers: new Set(['connect', 'connectAsync']),
    }),
  ],
  [
    '@azure/service-bus',
    client('message', {
      methods: new Set(['sendMessages']),
      makers: new Set(['ServiceBusClient']),
      derivers: new Set(['createSender']),
    }),
  ],
  ...FETCH_MODULES.map((name) => [
    name,
    client('remote', { callable: true, functions: new Set(['fetch', 'ofetch']) }),
  ]),
  ...HTTP_SERVERS.map((name) => [
    name,
    client('remote', { functions: new Set(['request', 'get']) }),
  ]),
]);

export function clientSpec(source) {
  if (source.startsWith('@aws-sdk/client-') && !DATABASE_SERVICES.test(source)) {
    return client(MESSAGE_SERVICES.test(source) ? 'message' : 'remote', {
      methods: new Set(['send']),
      makerPattern: /Client$/u,
      typePattern: /Client$/u,
    });
  }
  return SPECS.get(source);
}
