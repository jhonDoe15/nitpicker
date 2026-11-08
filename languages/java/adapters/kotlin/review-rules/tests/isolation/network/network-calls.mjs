import { splitArguments } from '../../../../scan/kotlin-brackets.mjs';
import { closeOf, skipSpace } from '../../discovery/text-scan.mjs';
import { isStubbed, mockNames, namesOfType, transportFaked } from './fakes.mjs';
import { isRemoteHost, isRemoteUrl, literalFrom, receiverLiteral } from './urls.mjs';

const OWN_TRANSPORT = /\b(?:exchangeFunction|requestFactory|clientConnector)\b/u;
const JAVA_CLIENT = /\bHttpClient\s*\.\s*(?:newHttpClient|newBuilder)\s*\(/u;
const OKHTTP_CLIENT = /\bOkHttpClient\s*(?:\(|\.\s*Builder\b)/u;
const APACHE_CLIENT = /\b(?:HttpClients|HttpClientBuilder|CloseableHttpClient)\b/u;
const SPRING_CLIENT = /\b(?:WebClient|RestClient)\b/u;
function always() {
  return true;
}
const ARGUMENT_CALLS = [
  [
    String.raw`HttpRequest\s*\.\s*newBuilder\s*\(`,
    'HttpRequest.newBuilder',
    (code) => JAVA_CLIENT.test(code),
  ],
  [
    String.raw`\.\s*uri\s*\(`,
    'HttpRequest.uri',
    (code) => JAVA_CLIENT.test(code) || (SPRING_CLIENT.test(code) && !OWN_TRANSPORT.test(code)),
  ],
  [
    String.raw`(?:RestClient|WebClient)\s*\.\s*create\s*\(`,
    'client.create',
    (code) => !OWN_TRANSPORT.test(code),
  ],
  [String.raw`\.\s*baseUrl\s*\(`, 'baseUrl', (code) => !OWN_TRANSPORT.test(code)],
  [
    String.raw`Request\s*\.\s*Builder\s*\(\s*\)(?:\s*\.\s*\w+\s*\([^()]*\))*\s*\.\s*url\s*\(`,
    'Request.url',
    (code) => OKHTTP_CLIENT.test(code),
  ],
  [String.raw`Jsoup\s*\.\s*connect\s*\(`, 'Jsoup.connect', always],
  [String.raw`Fuel\s*\.\s*(?:get|post|put|delete|patch|head|download|upload)\s*\(`, 'Fuel', always],
  [
    String.raw`(?<![\w.\x60])Http(?:Get|Post|Put|Delete|Patch|Head)\s*\(`,
    'Http request',
    (code) => APACHE_CLIENT.test(code),
  ],
].map(([source, family, applies]) => ({ pattern: new RegExp(source, 'gu'), family, applies }));
const URL_READ = /\.\s*(openConnection|openStream|readText|readBytes|getContent|content)\b/gu;
const FUEL_EXTENSION = /\.\s*(httpGet|httpPost|httpPut|httpDelete|httpPatch|httpHead)\s*\(/gu;
const REST_METHODS = [
  'getForObject getForEntity postForObject postForEntity postForLocation exchange put delete',
  'patchForObject headForHeaders optionsForAllow execute',
]
  .join(' ')
  .split(' ');
const REST_CALL = new RegExp(
  String.raw`(?<![\w\x60])(\w+)\s*\.\s*(${REST_METHODS.join('|')})\s*\(`,
  'gu',
);
const KTOR_CALL =
  /(?<![\w`])(\w+)\s*\.\s*(get|post|put|delete|patch|head|options|request)\s*(?:<[^<>()]*>\s*)?([({])/gu;
const KTOR_URL = /(?<![\w.`])url\s*\(/gu;
const SOCKET = /(?<![\w.`])(?:java\s*\.\s*net\s*\.\s*)?(Socket)\s*\(/gu;
const REST_NAME = /rest\s*template/iu;
const OWNER_WINDOW = 60;
const KTOR_NAMES = ['client', 'httpClient'];

function firstArgument(scanned, open) {
  const { parts } = splitArguments(scanned.code, open);
  return parts.length === 0 ? undefined : parts[0].start;
}

function hit({ match, family, literal }) {
  return { offset: match.index, family, literal };
}

function viaArguments(scanned) {
  return ARGUMENT_CALLS.filter(({ applies }) => applies(scanned.code)).flatMap(
    ({ pattern, family }) =>
      [...scanned.code.matchAll(pattern)].flatMap((match) => {
        const start = firstArgument(scanned, match.index + match[0].length - 1);
        const literal = start === undefined ? undefined : literalFrom(scanned, start);
        return literal === undefined ? [] : [hit({ match, family, literal })];
      }),
  );
}

function viaReceivers(scanned) {
  const reads = [...scanned.code.matchAll(URL_READ)].map((match) =>
    hit({ match, family: `URL.${match[1]}` }),
  );
  const fuel = [...scanned.code.matchAll(FUEL_EXTENSION)].map((match) =>
    hit({ match, family: 'Fuel' }),
  );
  return [...reads, ...fuel].map((found) => ({
    ...found,
    literal: receiverLiteral(scanned, found.offset),
  }));
}

function viaRestTemplates(scanned, mocks) {
  const typed = namesOfType(scanned, ['RestTemplate', 'TestRestTemplate']);
  return [...scanned.code.matchAll(REST_CALL)]
    .filter((match) => (typed.has(match[1]) || REST_NAME.test(match[1])) && !mocks.has(match[1]))
    .flatMap((match) => {
      const start = firstArgument(scanned, match.index + match[0].length - 1);
      const literal = start === undefined ? undefined : literalFrom(scanned, start);
      return literal === undefined
        ? []
        : [hit({ match, family: `RestTemplate.${match[2]}`, literal })];
    });
}

function ktorLambda(scanned, open) {
  const { code } = scanned;
  if (code[open] === '{') {
    return open;
  }
  const next = skipSpace(code, closeOf(scanned, open) + 1);
  return code[next] === '{' ? next : -1;
}

function ktorLiteral(scanned, match) {
  const open = match.index + match[0].length - 1;
  const lambda = ktorLambda(scanned, open);
  const region = lambda < 0 ? '' : scanned.code.slice(lambda, closeOf(scanned, lambda));
  const inner = [...region.matchAll(KTOR_URL)].map((url) => lambda + url.index + url[0].length);
  const start = scanned.code[open] === '(' ? firstArgument(scanned, open) : undefined;
  return [start, ...inner]
    .filter((at) => at !== undefined)
    .map((at) => literalFrom(scanned, at))
    .find(Boolean);
}

function viaKtor(scanned, mocks) {
  const names = new Set([...KTOR_NAMES, ...namesOfType(scanned, ['HttpClient'])]);
  return [...scanned.code.matchAll(KTOR_CALL)]
    .filter((match) => names.has(match[1]) && !mocks.has(match[1]))
    .flatMap((match) => {
      const literal = ktorLiteral(scanned, match);
      return literal === undefined
        ? []
        : [hit({ match, family: `HttpClient.${match[2]}`, literal })];
    });
}

function viaSockets(scanned) {
  return [...scanned.code.matchAll(SOCKET)].flatMap((match) => {
    const { parts } = splitArguments(scanned.code, match.index + match[0].length - 1);
    const literal = parts.length === 2 ? literalFrom(scanned, parts[0].start) : undefined;
    return literal !== undefined && isRemoteHost(literal)
      ? [hit({ match, family: match[1], literal })]
      : [];
  });
}

function receiverMocked(scanned, found, mocks) {
  const before = scanned.code.slice(Math.max(0, found.offset - OWNER_WINDOW), found.offset);
  const owner = /(\w+)\s*\??$/u.exec(before)?.[1];
  return owner !== undefined && mocks.has(owner);
}

export function networkCalls(scanned) {
  if (transportFaked(scanned)) {
    return [];
  }
  const mocks = mockNames(scanned);
  const urls = [
    ...viaArguments(scanned),
    ...viaReceivers(scanned),
    ...viaRestTemplates(scanned, mocks),
    ...viaKtor(scanned, mocks),
  ].filter(({ literal }) => literal !== undefined && isRemoteUrl(literal));
  return [...urls, ...viaSockets(scanned)]
    .filter((found) => !isStubbed(scanned, found.offset) && !receiverMocked(scanned, found, mocks))
    .toSorted((left, right) => left.offset - right.offset);
}
