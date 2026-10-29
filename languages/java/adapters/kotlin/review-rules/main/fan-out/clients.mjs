import { typeName } from '../../spring/spring-names.mjs';

export const REMOTE_KIND = 'remote';
export const MESSAGE_KIND = 'message';
const ANY = '*';
const KTOR_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'request'];
const KTOR_PREPARED = ['submitForm', 'prepareGet', 'preparePost', 'prepareRequest'];
const SPEC_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'method'];
const SEND = ['send'];
const CONVERT_AND_SEND = ['convertAndSend', 'send'];
const NOT_CALLS = new Set(['close', 'toString', 'let', 'also', 'apply', 'run', 'use', 'takeIf']);
const SPRING_WEB = 'org.springframework.web';
const AWS = 'software.amazon.awssdk.services';

function client(fqns, spec) {
  return fqns.map((fqn) => [fqn, spec]);
}

const CLIENTS = new Map([
  ...client(['io.ktor.client.HttpClient'], { methods: [...KTOR_METHODS, ...KTOR_PREPARED] }),
  ...client(['java.net.http.HttpClient'], { methods: ['send', 'sendAsync'] }),
  ...client(['okhttp3.OkHttpClient'], { methods: ['newCall'] }),
  ...client([`${SPRING_WEB}.client.RestTemplate`, `${SPRING_WEB}.client.RestOperations`], {
    methods: ANY,
  }),
  ...client(
    [`${SPRING_WEB}.client.RestClient`, `${SPRING_WEB}.reactive.function.client.WebClient`],
    { methods: SPEC_METHODS },
  ),
  ...client(['org.springframework.kafka.core.KafkaTemplate'], {
    messages: ['send', 'sendDefault'],
  }),
  ...client(
    [
      'org.apache.kafka.clients.producer.KafkaProducer',
      'org.apache.kafka.clients.producer.Producer',
    ],
    { messages: SEND },
  ),
  ...client(
    [
      'org.springframework.amqp.rabbit.core.RabbitTemplate',
      'org.springframework.amqp.core.AmqpTemplate',
    ],
    { messages: CONVERT_AND_SEND },
  ),
  ...client(['org.springframework.jms.core.JmsTemplate'], { messages: CONVERT_AND_SEND }),
  ...client(['org.springframework.cloud.stream.function.StreamBridge'], { messages: SEND }),
  ...client([`${AWS}.sqs.SqsClient`, `${AWS}.sqs.SqsAsyncClient`], {
    methods: ANY,
    messages: ['sendMessage', 'sendMessageBatch'],
  }),
  ...client([`${AWS}.sns.SnsClient`, `${AWS}.sns.SnsAsyncClient`], {
    methods: ANY,
    messages: ['publish', 'publishBatch'],
  }),
]);
export const SEMAPHORES = new Set([
  'kotlinx.coroutines.sync.Semaphore',
  'java.util.concurrent.Semaphore',
]);

function kindOf(spec, method) {
  if (NOT_CALLS.has(method)) {
    return undefined;
  }
  if (spec.messages?.includes(method)) {
    return MESSAGE_KIND;
  }
  return spec.methods === ANY || spec.methods?.includes(method) ? REMOTE_KIND : undefined;
}

export function clientOf(view, type) {
  const name = typeName(type);
  if (name === '') {
    return undefined;
  }
  const fqn = view.resolve(name).find((candidate) => CLIENTS.has(candidate));
  return fqn === undefined ? undefined : CLIENTS.get(fqn);
}

export function kindOfType(view, type, method) {
  const spec = clientOf(view, type);
  return spec === undefined ? undefined : kindOf(spec, method);
}

export function callKind(view, invocation) {
  if (invocation.receiver === undefined || invocation.assign === true) {
    return undefined;
  }
  return kindOfType(view, view.typeOf(invocation.scope, invocation.receiver), invocation.name);
}
