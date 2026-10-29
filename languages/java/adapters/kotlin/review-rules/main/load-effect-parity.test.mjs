import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kotlinCovers, kotlinPairs } from './load-effect-types.mjs';

const RULESET = path.resolve(import.meta.dirname, '../../../../gradle/pmd-main-ruleset.xml');
const ARGUMENT_TYPES = new Set(['java.lang.String', 'java.io.File', 'java.nio.file.Path']);
const DETEKT = 'detekt ForbiddenMethodCall reports it in Kotlin';
const CHAIN = 'Kotlin follows the call from the client that builds it, a chain root';
const EXTENSION =
  'a Kotlin extension function; Java does the same work through Files, which it covers';
const JAVA_ONLY = new Map([
  ['java.lang.Thread#start', DETEKT],
  ['java.lang.Thread#sleep', DETEKT],
  ['java.lang.Runtime#exec', DETEKT],
  ['org.springframework.web.client.RestClient.RequestHeadersSpec#*', CHAIN],
  ['org.reactivestreams.Publisher#*', CHAIN],
]);
const CHAIN_ROOTS = [
  'okhttp3.OkHttpClient',
  'retrofit2.Retrofit',
  'org.springframework.web.client.RestTemplate',
  'org.springframework.web.client.RestClient',
  'org.springframework.web.reactive.function.client.WebClient',
  'org.apache.hc.client5.http.impl.classic.CloseableHttpClient',
  'org.apache.http.impl.client.CloseableHttpClient',
];

function chainRoots() {
  return new RegExp(
    `^(?:${CHAIN_ROOTS.map((type) => type.replaceAll('.', '\\.')).join('|')})#`,
    'u',
  );
}

const KOTLIN_ONLY = [
  [/^java\.nio\.file\.Path#/u, EXTENSION],
  [
    /^java\.io\.File#(?:read|write|append|forEach|use|buffered|input|output|reader|writer|print|copy)/u,
    EXTENSION,
  ],
  [/^java\.io\.File#(?:deleteRecursively|walk)/u, EXTENSION],
  [/^java\.net\.URL#read/u, EXTENSION],
  [
    /^java\.lang\.(?:System#exit|Runtime#exit|Runtime#halt)$/u,
    'Java leaves it to DoNotTerminateVM',
  ],
  [/^kotlin\.(?:system|concurrent)#/u, 'a Kotlin top-level function'],
  [/^kotlinx\.coroutines\./u, 'Kotlin coroutines'],
  [chainRoots(), CHAIN],
];
const SUPERTYPES = new Map([
  ['java.util.concurrent.ScheduledExecutorService', 'java.util.concurrent.ExecutorService'],
  ['java.util.concurrent.ExecutorService', 'java.util.concurrent.Executor'],
  ['java.util.concurrent.ForkJoinPool', 'java.util.concurrent.ExecutorService'],
  ['java.util.concurrent.ScheduledThreadPoolExecutor', 'java.util.concurrent.ThreadPoolExecutor'],
  ['com.zaxxer.hikari.HikariDataSource', 'javax.sql.DataSource'],
  ['java.util.jar.JarFile', 'java.util.zip.ZipFile'],
  ['java.net.MulticastSocket', 'java.net.DatagramSocket'],
]);

function ruleXpath() {
  const xml = readFileSync(RULESET, 'utf8');
  const rule = xml.slice(xml.indexOf('<rule name="ClassLoadEffect"'));
  return rule.slice(rule.indexOf('<![CDATA['), rule.indexOf(']]>'));
}

function lists(xpath) {
  return new Map(
    [...xpath.matchAll(/\$(\w+) := \(([^)]*)\)/gu)].map(([, name, body]) => [
      `$${name}`,
      [...body.matchAll(/'([^']+)'/gu)].map(([, method]) => method),
    ]),
  );
}

function signaturePairs(calls) {
  return [...calls.matchAll(/matchesSig\('([^#']+)#([^(']+)\(/gu)].map(([, type, method]) => {
    if (method !== '_') {
      return `${type}#${method}`;
    }
    return calls.includes(`starts-with(@MethodName, 'new') and pmd-java:matchesSig('${type}#`)
      ? `${type}#new*`
      : `${type}#*`;
  });
}

function receiverPairs(calls, named) {
  const pattern =
    /@MethodName = (\$\w+|\([^)]*\))\s+and \*\[1\](?:\[not\(self::ArgumentList\)\])?\[pmd-java:typeIs\('([^']+)'\)/gu;
  return [...calls.matchAll(pattern)].flatMap(([, methods, type]) => {
    const names =
      named.get(methods) ?? [...methods.matchAll(/'([^']+)'/gu)].map(([, name]) => name);
    return names.map((method) => `${type}#${method}`);
  });
}

function javaPairs() {
  const xpath = ruleXpath();
  const calls = xpath.slice(xpath.indexOf('//MethodCall'), xpath.indexOf('| //ConstructorCall'));
  const constructors = xpath.slice(
    xpath.indexOf('| //ConstructorCall'),
    xpath.indexOf('let $owner'),
  );
  const typeExpressions = [...calls.matchAll(/TypeExpression\]\[pmd-java:typeIs\('([^']+)'\)/gu)];
  const created = [...constructors.matchAll(/typeIs\('([^']+)'\)/gu)]
    .map(([, type]) => type)
    .filter((type) => !ARGUMENT_TYPES.has(type));
  return [
    ...new Set([
      ...signaturePairs(calls),
      ...receiverPairs(calls, lists(xpath)),
      ...typeExpressions.map(([, type]) => `${type}#*`),
      ...created.map((type) => `${type}#new`),
    ]),
  ];
}

function reasonKey(pair) {
  return JAVA_ONLY.has(pair) ? pair : `${pair.split('#')[0]}#*`;
}

function javaOnlyReason(pair) {
  return JAVA_ONLY.get(reasonKey(pair));
}

function kotlinOnlyReason(pair) {
  return KOTLIN_ONLY.find(([pattern]) => pattern.test(pair))?.[1];
}

function supertypes(type) {
  const parent = SUPERTYPES.get(type);
  return parent === undefined ? [type] : [type, ...supertypes(parent)];
}

function javaCovers(pairs, pair) {
  const [type, method] = pair.split('#');
  const bare = method.replace(/\(\+\)$/u, '');
  return supertypes(type).some(
    (candidate) => pairs.has(`${candidate}#${bare}`) || pairs.has(`${candidate}#*`),
  );
}

describe('class-load effect parity between the Java and Kotlin rules', () => {
  const java = javaPairs();
  const kotlin = kotlinPairs();

  it('reads the effect pairs of the Java rule', () => {
    expect(java).toEqual(
      expect.arrayContaining([
        'java.sql.DriverManager#getConnection',
        'java.nio.file.Files#*',
        'java.util.concurrent.Executors#new*',
        'java.io.File#mkdirs',
        'org.springframework.web.client.RestOperations#getForObject',
        'org.springframework.web.client.RestClient.RequestHeadersSpec#retrieve',
        'org.reactivestreams.Publisher#block',
        'java.util.Timer#new',
      ]),
    );
    expect(java).not.toContain('java.lang.String#new');
  });

  it('covers every Java pair in Kotlin or names why Kotlin leaves it', () => {
    const missing = java.filter((pair) => {
      const [type, method] = pair.split('#');
      return !kotlinCovers(type, method) && javaOnlyReason(pair) === undefined;
    });

    expect(missing).toEqual([]);
  });

  it('covers every Kotlin pair in Java or names why Java leaves it', () => {
    const pairs = new Set(java);
    const missing = kotlin.filter(
      (pair) => !javaCovers(pairs, pair) && kotlinOnlyReason(pair) === undefined,
    );

    expect(missing).toEqual([]);
  });

  it('keeps no reason that no pair needs', () => {
    const pairs = new Set(java);
    const unused = [
      ...[...JAVA_ONLY.keys()].filter(
        (key) => kotlinCovers(...key.split('#')) || !java.some((pair) => reasonKey(pair) === key),
      ),
      ...KOTLIN_ONLY.filter(([pattern]) => !kotlin.some((pair) => pattern.test(pair))).map(String),
      ...kotlin.filter((pair) => javaCovers(pairs, pair) && kotlinOnlyReason(pair) !== undefined),
    ];

    expect(unused).toEqual([]);
  });
});
