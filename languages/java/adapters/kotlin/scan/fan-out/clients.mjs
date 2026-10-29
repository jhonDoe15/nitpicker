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
function declaredType(name) {
  return new RegExp(
    String.raw`(?<![\w.])${name}\s*:\s*([A-Z]\w*)|\b(?:val|var)\s+${name}\s*=\s*([A-Z]\w*)\s*[.(<]`,
    'g',
  );
}

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
  const types = [...code.matchAll(declaredType(name))].map((match) => match[1] ?? match[2]);
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

function declarationStart(tail) {
  const token = /[={]/.exec(tail);
  if (token === null) {
    return undefined;
  }
  const signature = tail.slice(0, token.index).trim();
  const returnType = signature.slice(1).trim();
  const plain = signature === '' || (signature.startsWith(':') && !returnType.includes('\n'));
  return plain ? { offset: token.index, token: token[0] } : undefined;
}

export function functionBodies(code) {
  const bodies = new Map();
  for (const match of code.matchAll(FUNCTION)) {
    const close = closingIndex(code, match.index + match[0].length - 1);
    const declaration = declarationStart(code.slice(close + 1));
    if (declaration !== undefined) {
      const start = close + 1 + declaration.offset;
      const end = declaration.token === '{' ? closingIndex(code, start) : code.indexOf('\n', start);
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

function helperBodies(text, file) {
  return [...text.matchAll(PLAIN_CALL)].flatMap(([, name]) =>
    (file.functions.get(name) ?? []).map((body) => ({ name, body })),
  );
}

function nextEntries(entry, file) {
  if (entry.depth >= HELPER_DEPTH) {
    return [];
  }
  return helperBodies(entry.text, file).map(({ name, body }) => ({
    text: body,
    depth: entry.depth + 1,
    helper: entry.depth === 0 ? `${name}()` : entry.helper,
  }));
}

export function remoteCall(text, file) {
  const pending = [{ text, depth: 0, helper: '' }];
  for (const entry of pending) {
    const direct = directCall(entry.text, file);
    if (direct !== undefined) {
      return entry.depth === 0 ? direct : { ...direct, helper: entry.helper };
    }
    pending.push(...nextEntries(entry, file));
  }
  return undefined;
}

export function isBounded(text, file) {
  const pending = [{ text, depth: 0, helper: '' }];
  for (const entry of pending) {
    if (BOUND.test(entry.text)) {
      return true;
    }
    pending.push(...nextEntries(entry, file));
  }
  return false;
}
