import { describe, expect, it } from 'vitest';
import {
  argument,
  file,
  fn,
  klass,
  loaded,
  routeOf,
  routed,
  run,
  segment,
  testFile,
} from '../test-support/facts.mjs';
import { loadEffectFindings } from './load-effects.mjs';

const imports = (...paths) =>
  paths.map((target) =>
    target.endsWith('.*')
      ? { path: target.slice(0, -2), all: true }
      : { path: target.split(' as ')[0], alias: target.split(' as ')[1], all: false },
  );
const call = (name, receiver = [], overrides = {}) =>
  loaded(
    name,
    {},
    { receiver, text: `${receiver.map((s) => s.name).join('.')}.${name}()`, ...overrides },
  );
const args = (...texts) => texts.map((text) => argument(text));
const lines = (findings) =>
  findings.map(({ symbol, location }) => `${symbol} ${String(location.line)}`);
const findingsOf = (overrides, options = {}) => run(loadEffectFindings, [file(overrides)], options);
const expected = (callText, place) =>
  routed(
    [
      'Do this work in a function that main or the framework calls after startup',
      '(a @Bean method, an ApplicationRunner, a Ktor module) and pass the result in,',
      `or defer it with by lazy: \`${callText}\` runs while ${place},`,
      'so it connects, starts threads or touches files in whatever order classes load,',
      'and in every test that touches it. Constants, loggers, Regex and collections can stay,',
      'and the top-level code of a file with fun main is not checked.',
    ].join(' '),
    'ClassLoadEffect',
  );

describe('class-load effects in Kotlin: what is reported', () => {
  it('reports a JDBC connection opened by a top-level property, with the call, place and route', () => {
    const findings = findingsOf({
      imports: imports('java.sql.DriverManager'),
      loads: [
        call('getConnection', [segment('DriverManager')], {
          text: 'DriverManager.getConnection("jdbc:h2:mem:a", user)',
          context: { kind: 'file', owner: '', member: 'database' },
        }),
      ],
    });

    expect(lines(findings)).toEqual(['database 3']);
    expect(findings[0].message).toBe(
      expected('DriverManager.getConnection(...)', 'Sample.kt loads (in top-level database)'),
    );
    expect(routeOf(findings[0].message)).toBe(
      'If this is intended, add {"rule":"pmd/ClassLoadEffect","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    [
      'an import alias',
      ['java.sql.DriverManager as Jdbc'],
      call('getConnection', [segment('Jdbc')]),
    ],
    [
      'a qualified name',
      [],
      call(
        'readString',
        ['java', 'nio', 'file', 'Files'].map((name) => segment(name)),
      ),
    ],
    ['a static import', ['java.nio.file.Files.readString'], call('readString')],
    ['a star import', ['java.nio.file.*'], call('exists', [segment('Files')])],
    [
      'a constructor',
      ['java.io.FileInputStream'],
      call('FileInputStream', [], { arguments: args('"a"') }),
    ],
    [
      'a socket that connects',
      ['java.net.Socket'],
      call('Socket', [], { arguments: args('"h"', '80') }),
    ],
    ['a file a constructor opens', ['java.io.File'], call('readText', [segment('File', true)])],
    ['a default import', [], call('start', [segment('ProcessBuilder', true, args('"git"'))])],
    [
      'a system property write',
      [],
      call('setProperty', [segment('System')], { arguments: args('"a"', '"b"') }),
    ],
    [
      'a factory chain',
      [],
      call('addShutdownHook', [segment('Runtime'), segment('getRuntime', true)]),
    ],
    [
      'a coroutine scope that launches',
      ['kotlinx.coroutines.CoroutineScope'],
      call('launch', [segment('CoroutineScope', true, args('Dispatchers.IO'))]),
    ],
    [
      'an imported exit',
      ['kotlin.system.exitProcess'],
      call('exitProcess', [], { arguments: args('1') }),
    ],
    [
      'a builder that is built',
      ['java.net.http.HttpClient'],
      call('send', [segment('HttpClient'), segment('newBuilder', true), segment('build', true)]),
    ],
    [
      'a top-level timer written in full',
      [],
      call(
        'fixedRateTimer',
        ['kotlin', 'concurrent'].map((name) => segment(name)),
      ),
    ],
    [
      'an exit written in full',
      [],
      call(
        'exitProcess',
        ['kotlin', 'system'].map((name) => segment(name)),
      ),
    ],
    [
      'a time zone change written in full, which no import ban sees',
      [],
      call(
        'setDefault',
        ['java', 'util', 'TimeZone'].map((name) => segment(name)),
      ),
    ],
    ['a process pipeline', [], call('startPipeline', [segment('ProcessBuilder')])],
    [
      'a task the common pool runs',
      ['java.util.concurrent.ForkJoinPool'],
      call('submit', [segment('ForkJoinPool'), segment('commonPool', true)]),
    ],
    [
      'a task a scheduled pool schedules',
      ['java.util.concurrent.Executors'],
      call('schedule', [segment('Executors'), segment('newScheduledThreadPool', true)]),
    ],
    [
      'a task a single scheduled executor schedules',
      ['java.util.concurrent.Executors'],
      call('scheduleAtFixedRate', [
        segment('Executors'),
        segment('newSingleThreadScheduledExecutor', true),
      ]),
    ],
  ])('reports %s', (_, paths, item) => {
    expect(findingsOf({ imports: imports(...paths), loads: [item] })).toHaveLength(1);
  });

  it('follows a property to the client it holds, through a declared type or a builder', () => {
    const bindings = [
      { name: 'pool', owner: 'Clients', local: false, init: [segment('HikariDataSource', true)] },
      { name: 'source', owner: 'Clients', local: false, type: 'DataSource' },
      {
        name: 'ok',
        owner: 'Clients',
        local: false,
        init: [segment('OkHttpClient'), segment('Builder', true), segment('build', true)],
      },
    ];
    const context = { kind: 'object', owner: 'Clients', member: 'page' };
    const loads = [
      call('connection', [segment('source')], { call: false, context }),
      call('execute', [segment('ok'), segment('newCall', true)], { context }),
      call('connection', [segment('pool')], { call: false, context }),
      call('connection', [segment('load', true)], { call: false, context }),
    ];
    const findings = findingsOf({
      imports: imports(
        'javax.sql.DataSource',
        'okhttp3.OkHttpClient',
        'com.zaxxer.hikari.HikariDataSource',
      ),
      bindings,
      loads,
    });

    expect(lines(findings)).toEqual(['Clients.page 3', 'Clients.page 3', 'Clients.page 3']);
  });

  it.each([
    ['java.util.concurrent.Executor', 'execute'],
    ['java.util.concurrent.ScheduledExecutorService', 'scheduleAtFixedRate'],
    ['java.util.concurrent.ForkJoinPool', 'invoke'],
    ['okhttp3.Call', 'execute'],
    ['retrofit2.Call', 'enqueue'],
    ['org.apache.hc.client5.http.async.HttpAsyncClient', 'execute'],
    ['org.springframework.web.client.RestOperations', 'getForObject'],
  ])('follows a property declared as %s', (qualified, method) => {
    const context = { kind: 'object', owner: 'Jobs', member: 'init' };
    const type = qualified.split('.').at(-1);
    const findings = findingsOf({
      imports: imports(qualified),
      bindings: [{ name: 'jobs', owner: 'Jobs', local: false, type }],
      loads: [call(method, [segment('jobs')], { context, arguments: args('task') })],
    });

    expect(lines(findings)).toEqual(['Jobs.init 3']);
  });

  it.each([
    [{ kind: 'object', owner: 'Store', member: 'init' }, 'object Store loads (in init)'],
    [
      { kind: 'companion', owner: 'Repo.Companion', member: 'shared' },
      'the companion object of Repo loads (in shared)',
    ],
    [{ kind: 'enum', owner: 'Mode', member: 'FAST' }, 'enum class Mode loads (in FAST)'],
    [
      { kind: 'singleton', owner: 'Registry', member: 'connection' },
      'the companion object of Registry loads and creates a Registry (in connection)',
    ],
    [
      { kind: 'object', owner: 'Cfg', member: 'read()', site: 'text' },
      'object Cfg loads (in read(), which text calls)',
    ],
  ])('names the place that loads for %o', (context, place) => {
    const findings = findingsOf({
      imports: imports('java.sql.DriverManager'),
      loads: [call('getConnection', [segment('DriverManager')], { context })],
    });

    expect(findings[0].message).toBe(expected('DriverManager.getConnection()', place));
  });
});

describe('class-load effects in Kotlin: what is left alone', () => {
  it.each([
    ['a logger', ['java.util.logging.Logger'], call('getLogger', [segment('Logger')])],
    ['a regex', [], call('Regex', [], { arguments: args('"[a-z]"') })],
    ['a property read', [], call('getProperty', [segment('System')])],
    ['an environment read, which detekt owns', [], call('getenv', [segment('System')])],
    ['a thread start, which detekt owns', [], call('start', [segment('Thread', true)])],
    ['thread { }, which detekt owns', ['kotlin.concurrent.thread'], call('thread')],
    [
      'Runtime.exec, which detekt owns',
      [],
      call('exec', [segment('Runtime'), segment('getRuntime', true)]),
    ],
    ['a socket that does not connect yet', ['java.net.Socket'], call('Socket')],
    [
      'a pool without a configuration',
      ['com.zaxxer.hikari.HikariDataSource'],
      call('HikariDataSource'),
    ],
    [
      'a writer around a stream',
      ['java.io.PrintWriter'],
      call('PrintWriter', [], { arguments: args('out') }),
    ],
    [
      'a scanner of a text',
      ['java.util.Scanner'],
      call('Scanner', [], { arguments: args('text') }),
    ],
    ['an unknown receiver', [], call('readText', [segment('settings')])],
    ['a class without an import', [], call('getConnection', [segment('DriverManager')])],
    [
      'an imported time zone change, which detekt bans at the import',
      ['java.util.TimeZone'],
      call('setDefault', [segment('TimeZone')]),
    ],
  ])('leaves %s alone', (_, paths, item) => {
    expect(findingsOf({ imports: imports(...paths), loads: [item] })).toEqual([]);
  });

  it('prefers a class of the same package over a star import, as Kotlin does', () => {
    const own = file({ classes: [klass('Files')] });
    const findings = run(
      loadEffectFindings,
      [file({ imports: imports('java.nio.file.*'), loads: [call('exists', [segment('Files')])] })],
      { declaredIn: [own] },
    );

    expect(findings).toEqual([]);
  });

  it('skips the file with fun main and an object with a @JvmStatic main, but not a plain main', () => {
    const item = (context) => call('readString', [segment('Files')], { context });
    const loads = [
      item({ kind: 'file', owner: '', member: 'config' }),
      item({ kind: 'object', owner: 'Launcher', member: 'config' }),
      item({ kind: 'object', owner: 'Tool', member: 'config' }),
    ];
    const functions = [
      fn('main', { owner: 'Launcher', annotations: ['JvmStatic'] }),
      fn('main', { owner: 'Tool' }),
    ];
    const entryFile = { imports: imports('java.nio.file.Files'), loads, functions };

    expect(lines(findingsOf(entryFile))).toEqual(['config 3', 'Tool.config 3']);
    expect(lines(findingsOf({ ...entryFile, functions: [...functions, fn('main')] }))).toEqual([
      'Tool.config 3',
    ]);
  });

  it('reads production files only', () => {
    const loads = [call('getConnection', [segment('DriverManager')])];
    const tests = testFile({ imports: imports('java.sql.DriverManager'), loads });

    expect(run(loadEffectFindings, [tests])).toEqual([]);
  });
});
