import { closingIndex } from '../kotlin-source.mjs';

const MESSAGE_KIND = 'message';
const REMOTE_KIND = 'remote';
const ANY = '*';
const KTOR_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'head',
  'options',
  'request',
  'submitForm',
];
const SPEC_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'method'];
const CLIENTS = new Map([
  [
    'HttpClient',
    {
      packages: ['io.ktor.client', 'java.net.http'],
      methods: [
        ...KTOR_METHODS,
        'prepareGet',
        'preparePost',
        'prepareRequest',
        'send',
        'sendAsync',
      ],
    },
  ],
  ['OkHttpClient', { packages: ['okhttp3'], methods: ['newCall'] }],
  ['RestTemplate', { packages: ['org.springframework.web.client'], methods: ANY }],
  ['RestOperations', { packages: ['org.springframework.web.client'], methods: ANY }],
  ['RestClient', { packages: ['org.springframework.web.client'], methods: SPEC_METHODS }],
  [
    'WebClient',
    { packages: ['org.springframework.web.reactive.function.client'], methods: SPEC_METHODS },
  ],
  [
    'KafkaTemplate',
    { packages: ['org.springframework.kafka.core'], messages: ['send', 'sendDefault'] },
  ],
  ['KafkaProducer', { packages: ['org.apache.kafka.clients.producer'], messages: ['send'] }],
  ['Producer', { packages: ['org.apache.kafka.clients.producer'], messages: ['send'] }],
  [
    'RabbitTemplate',
    { packages: ['org.springframework.amqp.rabbit.core'], messages: ['convertAndSend', 'send'] },
  ],
  [
    'AmqpTemplate',
    { packages: ['org.springframework.amqp.core'], messages: ['convertAndSend', 'send'] },
  ],
  [
    'JmsTemplate',
    { packages: ['org.springframework.jms.core'], messages: ['convertAndSend', 'send'] },
  ],
  ['StreamBridge', { packages: ['org.springframework.cloud.stream.function'], messages: ['send'] }],
  [
    'SqsClient',
    {
      packages: ['software.amazon.awssdk.services.sqs'],
      methods: ANY,
      messages: ['sendMessage', 'sendMessageBatch'],
    },
  ],
  [
    'SnsClient',
    {
      packages: ['software.amazon.awssdk.services.sns'],
      methods: ANY,
      messages: ['publish', 'publishBatch'],
    },
  ],
]);
const NOT_CALLS = new Set(['close', 'toString', 'let', 'also', 'apply', 'run', 'use', 'takeIf']);
export const MEMBER_CALL =
  /(?<![\w.])(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*(?:!!|\?)?\.\s*([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?[({]/g;
const PLAIN_CALL = /(?<![\w.])(?:this\s*\.\s*)?([a-z_]\w*)\s*\(/g;
const FUNCTION = /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([a-z_]\w*)\s*\(/g;
export const BOUND = /\.\s*withPermit\s*\{|\.\s*acquire\s*\(|\blimitedParallelism\s*\(/;
const HELPER_DEPTH = 3;
const DECLARED_TYPE = (name) =>
  new RegExp(
    String.raw`(?<![\w.])${name}\s*:\s*([A-Z]\w*)|\b(?:val|var)\s+${name}\s*=\s*([A-Z]\w*)\s*[.(<]`,
    'g',
  );
export function importsOf(code) {
  return [...code.matchAll(/^[ \t]*import\s+([\w.]+(?:\.\*)?)/gm)].map((match) => match[1]);
}

function isImported(imports, type, packages) {
  return imports.some((entry) =>
    packages.some(
      (pkg) => entry === `${pkg}.${type}` || (entry.startsWith(`${pkg}.`) && entry.endsWith('.*')),
    ),
  );
}

export function receiverType(code, name, imports) {
  const types = [...code.matchAll(DECLARED_TYPE(name))].map((match) => match[1] ?? match[2]);
  const [first] = types;
  const spec = CLIENTS.get(first);
  const agreed = first !== undefined && types.every((type) => type === first);
  return agreed && spec !== undefined && isImported(imports, first, spec.packages)
    ? spec
    : undefined;
}

export function callKind(spec, method) {
  if (NOT_CALLS.has(method)) {
    return undefined;
  }
  if (spec.messages?.includes(method)) {
    return MESSAGE_KIND;
  }
  return spec.methods === ANY || spec.methods?.includes(method) ? REMOTE_KIND : undefined;
}

export function functionBodies(code) {
  const bodies = new Map();
  for (const match of code.matchAll(FUNCTION)) {
    const close = closingIndex(code, match.index + match[0].length - 1);
    const rest = /^\s*(?::\s*[^={\n]+)?\s*([={])/.exec(code.slice(close + 1));
    if (rest !== null) {
      const start = close + 1 + rest[0].length - 1;
      const end = rest[1] === '{' ? closingIndex(code, start) : code.indexOf('\n', start);
      bodies.set(match[1], [
        ...(bodies.get(match[1]) ?? []),
        code.slice(start, end < 0 ? undefined : end),
      ]);
    }
  }
  return bodies;
}

function directCall(text, file) {
  for (const [whole, receiver, method] of text.matchAll(MEMBER_CALL)) {
    const spec = receiverType(file.code, receiver, file.imports);
    const kind = spec === undefined ? undefined : callKind(spec, method);
    if (kind !== undefined) {
      return { call: `${receiver}.${method}`, kind, text: whole };
    }
  }
  return undefined;
}

export function remoteCall(text, file, depth = 0) {
  const direct = directCall(text, file);
  if (direct !== undefined || depth >= HELPER_DEPTH) {
    return direct;
  }
  for (const [, name] of text.matchAll(PLAIN_CALL)) {
    const found = (file.functions.get(name) ?? [])
      .map((body) => remoteCall(body, file, depth + 1))
      .find(Boolean);
    if (found !== undefined) {
      return { ...found, helper: depth === 0 ? `${name}()` : found.helper };
    }
  }
  return undefined;
}

export function isBounded(text, file, depth = 0) {
  if (BOUND.test(text) || depth >= HELPER_DEPTH) {
    return BOUND.test(text);
  }
  return [...text.matchAll(PLAIN_CALL)].some(([, name]) =>
    (file.functions.get(name) ?? []).some((body) => isBounded(body, file, depth + 1)),
  );
}
