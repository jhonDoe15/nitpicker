import { describe, expect, it } from 'vitest';
import {
  call,
  file,
  fn,
  klass,
  routeOf,
  run,
  summary,
  testFile,
} from '../../test-support/facts.mjs';
import { SERVICE_LOOKUP_RULE, serviceLookupFindings } from './service-lookups.mjs';

const imp = (path, overrides = {}) => ({ path, all: false, ...overrides });
const inClass = (name = 'Orders', supers = []) => ({
  k: 'class',
  name,
  qualified: name,
  supers,
  visibility: 'public',
});
const inFun = (name = 'load') => ({ k: 'fun', name });
const lookup = (name, overrides = {}) => ({
  line: 7,
  name,
  positional: 0,
  lambda: false,
  delegated: false,
  annotations: [],
  scopes: [inFun(), inClass()],
  ...overrides,
});
const inLambda = (host) => [{ k: 'lambda', host }, inFun(), inClass()];
const sample = (overrides) => file(overrides);
const findingsFor = (files, options) => run(serviceLookupFindings, files, options);
const flagged = (overrides) => summary(findingsFor([sample(overrides)]));
const rule = (symbol) => `${SERVICE_LOOKUP_RULE} ${symbol} 7`;

describe('service lookups in Kotlin', () => {
  it('reports a Koin lookup imported by path, with the allowed form first and the exception route', () => {
    const findings = findingsFor([
      sample({
        imports: [imp('org.koin.core.component.inject')],
        lookups: [lookup('inject', { delegated: true })],
      }),
    ]);

    expect(summary(findings)).toEqual([rule('Orders.load: Koin inject()')]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toMatch(/^Take the dependency as a constructor parameter/u);
    expect(findings[0].message).toContain('with Koin inject() where it is used');
    expect(findings[0].message).not.toMatch(/line \d/u);
    expect(routeOf(findings[0].message)).toContain('"rule":"pmd/ServiceLocatorLookup"');
  });

  it.each([
    ['a wildcard import', [imp('org.koin.core.component', { all: true })], 'get', 'Koin get()'],
    ['an alias', [imp('org.koin.ktor.ext.get', { alias: 'koinGet' })], 'koinGet', 'Koin get()'],
    ['Compose', [imp('org.koin.compose.koinInject')], 'koinInject', 'Koin koinInject()'],
    [
      'Compose view models',
      [imp('org.koin.compose.viewmodel.koinViewModel')],
      'koinViewModel',
      'Koin koinViewModel()',
    ],
  ])('reports a bare Koin call resolved through %s', (_, imports, name, label) => {
    expect(flagged({ imports, lookups: [lookup(name)] })).toEqual([rule(`Orders.load: ${label}`)]);
  });

  it('reports getKoin() inside a KoinComponent, and one lookup for the whole chain', () => {
    const component = [inFun(), inClass('Orders', ['KoinComponent'])];

    expect(
      flagged({
        imports: [imp('org.koin.core.component.KoinComponent')],
        lookups: [
          lookup('getKoin', { scopes: component }),
          lookup('get', { qualifier: 'getKoin()', scopes: component }),
        ],
      }),
    ).toEqual([rule('Orders.load: Koin getKoin()')]);
  });

  it.each([
    [
      'GlobalContext',
      'GlobalContext',
      'get',
      'org.koin.core.context.GlobalContext',
      'GlobalContext.get()',
    ],
    [
      'KoinPlatform',
      'KoinPlatform',
      'getKoin',
      'org.koin.mp.KoinPlatform',
      'KoinPlatform.getKoin()',
    ],
    [
      'KoinJavaComponent',
      'KoinJavaComponent',
      'inject',
      'org.koin.java.KoinJavaComponent',
      'KoinJavaComponent.inject()',
    ],
    ['CDI', 'CDI', 'current', 'jakarta.enterprise.inject.spi.CDI', 'CDI.current()'],
    ['javax CDI', 'CDI', 'current', 'javax.enterprise.inject.spi.CDI', 'CDI.current()'],
  ])('reports %s through its import', (_, receiver, name, path, label) => {
    expect(
      flagged({ imports: [imp(path)], lookups: [lookup(name, { qualifier: receiver })] }),
    ).toEqual([rule(`Orders.load: ${label}`)]);
  });

  it('reports a fully qualified static lookup without any import of the type', () => {
    expect(
      flagged({
        imports: [imp('org.koin.core.Koin')],
        lookups: [lookup('get', { qualifier: 'org.koin.core.context.GlobalContext' })],
      }),
    ).toEqual([rule('Orders.load: GlobalContext.get()')]);
  });

  it.each([
    [
      'a typed parameter',
      [{ name: 'injector', type: 'Injector' }],
      'injector',
      'getInstance',
      'Injector.getInstance()',
    ],
    [
      'a nullable property',
      [{ name: 'injector', type: 'Injector' }],
      'this.injector',
      'getProvider',
      'Injector.getProvider()',
    ],
    [
      'an injector made in place',
      [{ name: 'injector', type: 'Guice.createInjector' }],
      'injector',
      'getBinding',
      'Injector.getBinding()',
    ],
    [
      'a call on the creating expression',
      [],
      'Guice.createInjector(Module())',
      'getInstance',
      'Injector.getInstance()',
    ],
  ])('reports a Guice lookup on %s', (_, typed, qualifier, name, label) => {
    expect(
      flagged({
        imports: [imp('com.google.inject.Injector'), imp('com.google.inject.Guice')],
        typed,
        lookups: [lookup(name, { qualifier })],
      }),
    ).toEqual([rule(`Orders.load: ${label}`)]);
  });

  it('reports the BeanManager and JNDI lookups by the declared type of the receiver', () => {
    expect(
      flagged({
        imports: [
          imp('jakarta.enterprise.inject.spi.BeanManager'),
          imp('javax.naming.InitialContext'),
          imp('javax.naming.Context'),
        ],
        typed: [
          { name: 'beans', type: 'BeanManager' },
          { name: 'context', type: 'Context' },
        ],
        lookups: [
          lookup('getReference', { qualifier: 'beans' }),
          lookup('createInstance', { qualifier: 'beans' }),
          lookup('lookup', { qualifier: 'InitialContext()' }),
          lookup('lookupLink', { qualifier: 'context' }),
        ],
      }),
    ).toEqual([
      rule('Orders.load: BeanManager.getReference()'),
      rule('Orders.load: BeanManager.createInstance()'),
      rule('Orders.load: InitialContext.lookup()'),
      rule('Orders.load: Context.lookupLink()'),
    ]);
  });

  it('reports one lookup for CDI.current().select(...) and one for a Koin typed receiver', () => {
    expect(
      flagged({
        imports: [imp('jakarta.enterprise.inject.spi.CDI'), imp('org.koin.core.Koin')],
        typed: [{ name: 'koin', type: 'Koin' }],
        lookups: [
          lookup('current', { qualifier: 'CDI' }),
          lookup('select', { qualifier: 'CDI.current()' }),
          lookup('get', { qualifier: 'koin' }),
        ],
      }),
    ).toEqual([rule('Orders.load: CDI.current()'), rule('Orders.load: Koin.get()')]);
  });

  it('gives every repeat of the same lookup in a function its own identity', () => {
    const findings = findingsFor([
      sample({
        imports: [imp('org.koin.core.component.get')],
        lookups: [lookup('get', { line: 3 }), lookup('get', { line: 9 })],
      }),
    ]);

    expect(new Set(findings.map(({ identity }) => identity)).size).toBe(2);
    expect(findings.map(({ identity }) => identity)).toEqual([
      'ServiceLocatorLookup:Orders.load: Koin get()',
      'ServiceLocatorLookup:Orders.load: Koin get()#2',
    ]);
  });
});

describe('service lookups that are not locators', () => {
  const koin = [imp('org.koin.core.component.get'), imp('org.koin.core.component.inject')];

  it.each([
    ['a get that no Koin import resolves', [], [lookup('get')]],
    ['a collection get on an unknown receiver', koin, [lookup('get', { qualifier: 'prices' })]],
    ['a Ktor route get with a handler', koin, [lookup('get', { lambda: true, positional: 1 })]],
    [
      'a lookup on a type that is not a context',
      [imp('java.rmi.registry.Registry')],
      [lookup('lookup', { qualifier: 'registry' })],
    ],
    [
      'select on an injected Instance',
      [imp('jakarta.enterprise.inject.Instance')],
      [lookup('select', { qualifier: 'mailers' })],
    ],
    [
      'a getInstance on another type',
      [imp('java.util.Calendar')],
      [lookup('getInstance', { qualifier: 'Calendar' })],
    ],
  ])('does not report %s', (_, imports, lookups) => {
    expect(flagged({ imports, lookups, typed: [{ name: 'registry', type: 'Registry' }] })).toEqual(
      [],
    );
  });

  it.each([
    ['module', 'module'],
    ['single', 'single'],
    ['factory', 'factory'],
    ['viewModel', 'viewModel'],
    ['startKoin', 'startKoin'],
  ])('lets a get inside a %s definition lambda resolve against the scope', (_, host) => {
    expect(
      flagged({ imports: koin, lookups: [lookup('get', { scopes: inLambda(host) })] }),
    ).toEqual([]);
  });

  it('still reports a lookup in a lambda that no Koin definition hosts', () => {
    expect(
      flagged({ imports: koin, lookups: [lookup('get', { scopes: inLambda('lazy') })] }),
    ).toEqual([rule('Orders.load: Koin get()')]);
  });

  it.each([
    ['a file with a top-level main', { functions: [fn('main')] }],
    [
      'a Ktor Application module',
      {
        functions: [fn('module', { receiver: 'Application' })],
        imports: [imp('io.ktor.server.application.Application')],
      },
    ],
    [
      'a SpringBootApplication class',
      {
        classes: [
          klass('Shop', { annotations: [{ name: 'SpringBootApplication', arguments: [] }] }),
        ],
        imports: [imp('org.springframework.boot.autoconfigure.SpringBootApplication')],
      },
    ],
    [
      'an Android Application',
      {
        classes: [klass('ShopApp', { supers: ['Application'] })],
        imports: [imp('android.app.Application')],
      },
    ],
    [
      'a file that starts Koin',
      { calls: [call('startKoin')], imports: [imp('org.koin.core.context.startKoin')] },
    ],
  ])('lets %s look dependencies up', (_, overrides) => {
    const imports = [...koin, ...(overrides.imports ?? [])];

    expect(flagged({ ...overrides, imports, lookups: [lookup('get')] })).toEqual([]);
  });

  it('lets a Guice module, a project module built on one, and a producer method look dependencies up', () => {
    const guice = [
      imp('com.google.inject.AbstractModule'),
      imp('com.google.inject.Injector'),
      imp('com.google.inject.Provides'),
    ];
    const base = sample({
      package: 'demo',
      imports: [imp('com.google.inject.AbstractModule')],
      classes: [klass('BaseModule', { supers: ['AbstractModule'] })],
    });
    const derived = sample({
      file: 'src/main/kotlin/demo/Wiring.kt',
      imports: guice,
      typed: [{ name: 'injector', type: 'Injector' }],
      classes: [klass('Wiring', { supers: ['BaseModule'] }), klass('Plain')],
      lookups: [
        lookup('getInstance', {
          qualifier: 'injector',
          scopes: [inFun(), inClass('Wiring', ['BaseModule'])],
        }),
        lookup('getInstance', {
          qualifier: 'injector',
          annotations: ['Provides'],
          scopes: [inFun(), inClass('Plain')],
        }),
        lookup('getInstance', {
          qualifier: 'injector',
          scopes: [inFun(), inClass('Plain')],
          line: 20,
        }),
      ],
    });

    expect(summary(findingsFor([derived], { declaredIn: [base, derived] }))).toEqual([
      `${SERVICE_LOOKUP_RULE} Plain.load: Injector.getInstance() 20`,
    ]);
  });

  it('lets a CDI producer method look a bean up and leaves test files alone', () => {
    const cdi = [
      imp('jakarta.enterprise.inject.spi.CDI'),
      imp('jakarta.enterprise.inject.Produces'),
    ];

    expect(
      flagged({
        imports: cdi,
        lookups: [lookup('current', { qualifier: 'CDI', annotations: ['Produces'] })],
      }),
    ).toEqual([]);
    expect(
      summary(
        findingsFor([
          testFile({ imports: cdi, lookups: [lookup('current', { qualifier: 'CDI' })] }),
        ]),
      ),
    ).toEqual([]);
  });
});
