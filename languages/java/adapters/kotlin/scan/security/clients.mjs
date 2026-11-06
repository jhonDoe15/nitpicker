import { closingIndex, enclosingOpen, inImport } from '../kotlin-source.mjs';

const REQUEST_BUILDER = /\bHttpRequest\s*\.\s*newBuilder\s*\(/g;
const CHAINED_CALL = /^\s*\??\.\s*([A-Za-z_]\w*)\s*(?:<[^<>()]*>\s*)?\(/;
const HTTP_URL =
  /\b(?:URL\s*\(|URI\s*(?:\(|\.\s*create\s*\()[^\n]*?\.\s*toURL\s*\(\s*\)|[A-Za-z_]\w*\s*\.\s*toURL\s*\(\s*\))/;
const RESOURCE = /\bgetResource\w*\s*\(|\bclassLoader\b|\bjavaClass\b/;
const OPEN_CONNECTION = /\.\s*openConnection\s*\(\s*\)/g;
const URL_READ = /\.\s*(?:readText|readBytes|openStream)\s*\(/g;
const HTTP_CAST = /^\s*as\??\s+(?:java\.net\.)?(?:javax\.net\.ssl\.)?Https?URLConnection\b/;
const READ_TIMEOUT = /\breadTimeout\s*=|\bsetReadTimeout\s*\(/;
const PLAIN_TEMPLATE = /\bRestTemplate\s*\(\s*\)/g;
const APACHE_FACTORY = /\bHttp(?:Async)?Clients\s*\.\s*create\w*\s*\(\s*\)/g;
const PER_REQUEST_CONFIG =
  /\.\s*(?:setConfig|setRequestConfig)\s*\(|\.\s*(?:config|requestConfig)\s*=[^=]/;
const APACHE_BUILDER = {
  start: /\bHttp(?:Async)?(?:Clients\s*\.\s*custom|ClientBuilder\s*\.\s*create)\s*\(/g,
  allowed: [
    'setDefaultRequestConfig',
    'setDefaultSocketConfig',
    'setConnectionManager',
    'setIOReactorConfig',
  ],
};
const JAX_RS_BUILDER = {
  start: /\bClientBuilder\s*\.\s*newBuilder\s*\(/g,
  allowed: ['readTimeout', 'property', 'withConfig'],
};
const JAX_RS_CLIENT =
  /(?:\b(?:val|var)\s+(\w+)\s*(?::[^=]*)?=\s*)?\bClientBuilder\s*\.\s*newClient\s*\(\s*\)/g;
const CLIENT_PROPERTY = /\.\s*property\s*\(/;
const UNSAFE_READERS = [
  /\bXMLDecoder\s*\(/g,
  /\benableDefaultTyping\s*\(/g,
  /\bactivateDefaultTyping\s*\(\s*LaissezFaireSubTypeValidator\b/g,
  /\bJsonTypeInfo\s*\.\s*Id\s*\.\s*(?:MINIMAL_)?CLASS\b/g,
  /\bSerializationUtils\s*\.\s*deserialize\s*(?:<[^<>]*>\s*)?\(/g,
  /\bisRegistrationRequired\s*=\s*false\b|\bsetRegistrationRequired\s*\(\s*false\s*\)/g,
];

export const CLIENT_MESSAGES = {
  HttpWithoutTimeout:
    'Give the call a deadline: `HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))` (java.net.http), `connectTimeout` and `readTimeout` on an `HttpURLConnection`, a client with timeouts (OkHttp, which sets them by default, or Ktor with `install(HttpTimeout) { requestTimeoutMillis = 10_000 }`), `RestTemplateBuilder().connectTimeout(...).readTimeout(...)` for Spring, `setDefaultRequestConfig(RequestConfig.custom().setResponseTimeout(...).build())` on the Apache client builder, or `connectTimeout` and `readTimeout` on a JAX-RS `ClientBuilder`. This HTTP call has no timeout, so a server that never answers hangs it for good.',
  UnsafeDeserialization:
    'Read the data as JSON into a concrete type: `Json.decodeFromString<Order>(text)` with kotlinx.serialization or `mapper.readValue<Order>(text)` with Jackson, with polymorphism by a logical name (a `sealed` class with kotlinx.serialization, or `@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)` with `@JsonSubTypes`). This reads class names or objects from the data, so a crafted payload builds any class on the classpath and runs code.',
};

function chainCalls(code, open) {
  const names = [];
  const opens = [open];
  for (const at of opens) {
    const close = closingIndex(code, at);
    const next = CHAINED_CALL.exec(code.slice(close + 1));
    if (next !== null) {
      names.push(next[1]);
      opens.push(close + next[0].length);
    }
  }
  return names;
}

function untimedBuilds(code, start, allowed) {
  return [...code.matchAll(start)].filter((match) => {
    const names = chainCalls(code, match.index + match[0].length - 1);
    return names.at(-1) === 'build' && !names.some((name) => allowed.includes(name));
  });
}

function copiesRequest(code, match) {
  const open = match.index + match[0].length - 1;
  const inside = code.slice(open + 1, closingIndex(code, open));
  return inside
    .replace(/,\s*$/, '')
    .replace(/\([^()]*\)|\{[^{}]*\}|\[[^[\]]*\]|<[^<>]*>/g, '')
    .includes(',');
}

function requestsWithoutTimeout(code) {
  return untimedBuilds(code, REQUEST_BUILDER, ['timeout'])
    .filter((match) => !copiesRequest(code, match))
    .map(({ index }) => index);
}

function builtIndexes(code, { start, allowed }) {
  return untimedBuilds(code, start, allowed).map(({ index }) => index);
}

function apacheClients(code) {
  if (PER_REQUEST_CONFIG.test(code)) {
    return [];
  }
  return [
    ...[...code.matchAll(APACHE_FACTORY)].map(({ index }) => index),
    ...builtIndexes(code, APACHE_BUILDER),
  ];
}

function handedOn(scope, name) {
  return name !== undefined && new RegExp(`[(,]\\s*${name}\\s*[,)]`).test(scope);
}

function jaxRsClients(code) {
  return [...code.matchAll(JAX_RS_CLIENT)].flatMap((match) => {
    const block = enclosingOpen(code, match.index);
    const scope = block === -1 ? code : code.slice(block, closingIndex(code, block));
    const at = match.index + match[0].search(/ClientBuilder/);
    return CLIENT_PROPERTY.test(scope) || handedOn(scope, match[1]) ? [] : [at];
  });
}

function clientsWithoutTimeout(code) {
  return [...apacheClients(code), ...builtIndexes(code, JAX_RS_BUILDER), ...jaxRsClients(code)];
}

function statementStart(code, offset) {
  return Math.max(code.lastIndexOf('\n', offset) + 1, code.lastIndexOf(';', offset) + 1);
}

function isHttpUrl(code, offset) {
  const statement = code.slice(statementStart(code, offset), offset);
  return HTTP_URL.test(statement) && !RESOURCE.test(statement);
}

function connectionsWithoutTimeout(code) {
  return [...code.matchAll(OPEN_CONNECTION)].flatMap((match) => {
    const after = match.index + match[0].length;
    const cast = HTTP_CAST.test(code.slice(after));
    if (!cast && !isHttpUrl(code, match.index)) {
      return [];
    }
    const block = enclosingOpen(code, match.index);
    const scope = block === -1 ? code : code.slice(block, closingIndex(code, block));
    return READ_TIMEOUT.test(scope) ? [] : [statementStart(code, match.index)];
  });
}

function urlReads(code) {
  return [...code.matchAll(URL_READ)].flatMap((match) =>
    isHttpUrl(code, match.index) ? [statementStart(code, match.index)] : [],
  );
}

export function httpWithoutTimeout(scanned) {
  const { code } = scanned;
  const offsets = [
    ...requestsWithoutTimeout(code),
    ...connectionsWithoutTimeout(code),
    ...urlReads(code),
    ...clientsWithoutTimeout(code),
    ...[...code.matchAll(PLAIN_TEMPLATE)].map(({ index }) => index),
  ];
  return [...new Set(offsets)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({
      rule: 'HttpWithoutTimeout',
      offset: offset + code.slice(offset).search(/\S/),
    }));
}

export function unsafeDeserialization(scanned) {
  return UNSAFE_READERS.flatMap((pattern) =>
    [...scanned.code.matchAll(pattern)]
      .map(({ index }) => index)
      .filter((index) => !inImport(scanned.code, index)),
  )
    .toSorted((left, right) => left - right)
    .map((offset) => ({ rule: 'UnsafeDeserialization', offset }));
}
