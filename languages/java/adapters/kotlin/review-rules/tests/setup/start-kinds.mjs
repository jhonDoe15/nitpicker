import { importsOf } from '../discovery/imports.mjs';
import {
  closeOf,
  execAt,
  lineEndOf,
  marksFrom,
  remembered,
  repeatUntil,
} from '../discovery/text-scan.mjs';

const SERVER_TYPES = new Set([
  'com.github.tomakehurst.wiremock.WireMockServer',
  'com.github.tomakehurst.wiremock.junit.WireMockRule',
  'okhttp3.mockwebserver.MockWebServer',
  'mockwebserver3.MockWebServer',
  'redis.embedded.RedisServer',
  'org.eclipse.jetty.server.Server',
  'org.apache.catalina.startup.Tomcat',
  'org.springframework.kafka.test.rule.EmbeddedKafkaRule',
  'org.mockserver.junit.MockServerRule',
]);
const ALWAYS_NEW_TYPES = new Set(['java.lang.ProcessBuilder']);
const IMPLICIT = new Map([['ProcessBuilder', 'java.lang.ProcessBuilder']]);
const CONTAINER_PACKAGE = 'org.testcontainers.';
const HTTP_SERVER = 'com.sun.net.httpserver.HttpServer';
const CREATION = /(?<![\w.`])([A-Z]\w*)(?:\s*<[^(){}]*>)?\s*\(/gu;
const FACTORY = /(?<![\w.`])(HttpServer|HttpsServer)\s*\.\s*create\s*\(/gu;
const DECLARATION = /(?<![\w.`])(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w.]+))?/gu;
const CHAINED = /^\s*(?:\?\.|\.)/u;
const MAX_CHAIN_LINES = 40;
const ALWAYS_NEW_CALLS = [
  {
    name: 'SpringApplication.run',
    pattern: /(?<![\w.`])SpringApplication\s*\.\s*run\s*\(/gu,
    needs: 'org.springframework.boot.SpringApplication',
  },
  {
    name: 'runApplication',
    pattern: /(?<![\w.`])runApplication(?:\s*<[^(){}]*>)?\s*\(/gu,
    needs: 'org.springframework.boot.runApplication',
  },
  {
    name: 'SpringApplicationBuilder.run',
    pattern: /(?<![\w.`])SpringApplicationBuilder\s*\([^\n]*\.\s*run\s*\(/gu,
    needs: 'org.springframework.boot.builder.SpringApplicationBuilder',
  },
  {
    name: 'Runtime.exec',
    pattern: /(?<![\w.`])Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(/gu,
  },
  {
    name: 'startClientAndServer',
    pattern: /(?<![\w`])startClientAndServer\s*\(/gu,
    needs: 'org.mockserver.integration.ClientAndServer',
  },
  {
    name: 'embeddedServer.start',
    pattern: /(?<![\w.`])embeddedServer\s*\([^\n]*\.\s*start\s*\(/gu,
    needs: 'io.ktor.server.engine.embeddedServer',
  },
];

function candidates(scanned, name) {
  if (name.includes('.')) {
    return [name];
  }
  const { explicit, aliases, stars } = importsOf(scanned);
  const direct = explicit.get(name) ?? aliases.get(name)?.qualified ?? IMPLICIT.get(name);
  return direct === undefined ? [...stars].map((pack) => `${pack}.${name}`) : [direct];
}

export function imports(scanned, qualified) {
  const simple = qualified.split('.').at(-1);
  const pack = qualified.slice(0, -simple.length - 1);
  const { explicit, stars } = importsOf(scanned);
  const parent = pack.slice(0, pack.lastIndexOf('.'));
  return explicit.get(simple) === qualified || stars.has(pack) || stars.has(parent);
}

export function heavyKind(scanned, name) {
  const simple = name.split('.').at(-1);
  return candidates(scanned, name).reduce((found, qualified) => {
    if (found !== undefined) {
      return found;
    }
    if (ALWAYS_NEW_TYPES.has(qualified)) {
      return 'always';
    }
    const container = qualified.startsWith(CONTAINER_PACKAGE) && simple.endsWith('Container');
    return container || SERVER_TYPES.has(qualified) ? 'reused' : undefined;
  }, undefined);
}

export function expressionEnd(scanned, from) {
  const { code } = scanned;
  const state = { end: lineEndOf(code, from) };
  for (const { index } of marksFrom(code, /[({[]/gu, from)) {
    if (index >= state.end) {
      break;
    }
    state.end = Math.max(state.end, lineEndOf(code, closeOf(scanned, index)));
  }
  repeatUntil(MAX_CHAIN_LINES, () => {
    const next = lineEndOf(code, state.end + 1);
    if (!CHAINED.test(code.slice(state.end + 1, next))) {
      return true;
    }
    state.end = next;
    return false;
  });
  return state.end;
}

function createsHeavy(scanned, from, to) {
  const text = scanned.code.slice(from, to);
  const kinds = [...text.matchAll(CREATION)].map((match) => heavyKind(scanned, match[1]));
  const factory = [...text.matchAll(FACTORY)].some((match) =>
    candidates(scanned, match[1]).some((name) => name.startsWith(HTTP_SERVER)),
  );
  return kinds.find((kind) => kind !== undefined) ?? (factory ? 'reused' : undefined);
}

export function declarationsOf(scanned) {
  return remembered(scanned, 'heavy-declarations', () =>
    [...scanned.code.matchAll(DECLARATION)].flatMap((match) => {
      const after = match.index + match[0].length;
      const initializer = execAt(scanned.code, /\s*=/u, after);
      const end = initializer === null ? after : expressionEnd(scanned, after);
      const kind =
        (match[2] === undefined ? undefined : heavyKind(scanned, match[2])) ??
        (initializer === null ? undefined : createsHeavy(scanned, after, end));
      return [{ name: match[1], offset: match.index, end, kind }];
    }),
  );
}

function importsFrom(scanned, qualified) {
  const { explicit, aliases } = importsOf(scanned);
  const named = [...explicit.values(), ...[...aliases.values()].map((alias) => alias.qualified)];
  return imports(scanned, qualified) || named.some((name) => name.startsWith(`${qualified}.`));
}

export function alwaysNewCalls(scanned) {
  return remembered(scanned, 'always-new-calls', () =>
    ALWAYS_NEW_CALLS.filter(
      ({ needs }) => needs === undefined || importsFrom(scanned, needs),
    ).flatMap(({ pattern, name }) =>
      [...scanned.code.matchAll(pattern)].map((match) => ({ offset: match.index, name })),
    ),
  );
}
