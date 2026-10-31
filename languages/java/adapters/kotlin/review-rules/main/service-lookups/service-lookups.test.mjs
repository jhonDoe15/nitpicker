import { describe, expect, it } from 'vitest';
import { argument, file, summary, testFile } from '../../test-support/facts.mjs';
import {
  composeMessage,
  findingsFor,
  flagged,
  imp,
  inClass,
  inFun,
  koinMessage,
  lookup,
  lookupMessage,
  rule,
} from '../../test-support/lookup-facts.mjs';

const sample = (overrides) => file(overrides);

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
    expect(findings[0].message).toBe(koinMessage('Koin inject()'));
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
    const component = [inFun(), inClass('Orders', { supers: ['KoinComponent'] })];

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

describe('service lookups by shape, scope and receiver', () => {
  const wildcard = [imp('org.koin.core.component', { all: true })];

  it.each([
    ['a qualifier', [argument('named("eu")')]],
    ['a named qualifier', [argument('named("eu")', { name: 'qualifier' })]],
    ['parameters in a trailing lambda', [argument('{ parametersOf(id) }', { lambda: true })]],
  ])('reports a bare Koin get with %s', (_, given) => {
    expect(flagged({ imports: wildcard, lookups: [lookup('get', { arguments: given })] })).toEqual([
      rule('Orders.load: Koin get()'),
    ]);
  });

  it('reports a typed Koin receiver with a trailing lambda, Spring JNDI and fully qualified calls', () => {
    expect(
      flagged({
        imports: [imp('org.koin.core.Koin'), imp('org.springframework.jndi.JndiTemplate')],
        typed: [
          { name: 'koin', type: 'Koin' },
          { name: 'jndi', type: 'JndiTemplate' },
        ],
        lookups: [
          lookup('get', { qualifier: 'koin', lambda: true }),
          lookup('lookup', { qualifier: 'jndi' }),
          lookup('lookup', { qualifier: 'org.springframework.jndi.JndiLocatorDelegate()' }),
          lookup('lookup', { qualifier: 'javax.naming.InitialContext()' }),
        ],
      }),
    ).toEqual([
      rule('Orders.load: Koin.get()'),
      rule('Orders.load: JndiTemplate.lookup()'),
      rule('Orders.load: JndiLocatorDelegate.lookup()'),
      rule('Orders.load: InitialContext.lookup()'),
    ]);
  });

  it('reports method references on a typed receiver and on the type', () => {
    expect(
      flagged({
        imports: [imp('com.google.inject.Injector')],
        typed: [{ name: 'injector', type: 'Injector' }],
        lookups: [
          lookup('getInstance', { qualifier: 'injector', reference: true }),
          lookup('getProvider', { qualifier: 'Injector', reference: true }),
          lookup('getProvider', { qualifier: 'Injector' }),
        ],
      }),
    ).toEqual([
      rule('Orders.load: Injector.getInstance()'),
      rule('Orders.load: Injector.getProvider()'),
    ]);
  });

  it('types a receiver by the nearest declaration in scope, not by its name elsewhere in the file', () => {
    const scopes = (owner, id) => [inFun('load', { frameId: 3 }), inClass(owner, { frameId: id })];

    expect(
      flagged({
        imports: [imp('org.koin.core.scope.Scope')],
        typed: [
          { name: 'scope', type: 'Scope', scope: 1, member: true },
          { name: 'scope', type: 'Map<String, Int>', scope: 2, member: true },
          { name: 'scope', type: 'Map<String, Int>', scope: 4 },
        ],
        lookups: [
          lookup('get', { qualifier: 'scope', scopes: scopes('A', 1) }),
          lookup('get', { qualifier: 'scope', scopes: scopes('B', 2), line: 8 }),
          lookup('get', {
            qualifier: 'scope',
            scopes: [inFun('shadow', { frameId: 4 }), inClass('A', { frameId: 1 })],
            line: 9,
          }),
        ],
      }),
    ).toEqual([rule('A.load: Scope.get()')]);
  });

  it('types a qualified receiver by a member declaration and a type alias by its target', () => {
    expect(
      flagged({
        imports: [imp('com.google.inject.Injector')],
        typeAliases: [{ name: 'Di', target: 'Injector' }],
        typed: [
          { name: 'injector', type: 'Injector', scope: 9, member: true },
          { name: 'di', type: 'Di' },
        ],
        lookups: [
          lookup('getInstance', { qualifier: 'other.injector' }),
          lookup('getBinding', { qualifier: 'di' }),
        ],
      }),
    ).toEqual([
      rule('Orders.load: Injector.getInstance()'),
      rule('Orders.load: Injector.getBinding()'),
    ]);
  });

  it('words the Koin, Compose and other lookups for their own allowed form', () => {
    const findings = findingsFor([
      sample({
        imports: [
          imp('org.koin.compose.viewmodel.koinViewModel'),
          imp('org.koin.compose.koinInject'),
          imp('com.google.inject.Injector'),
        ],
        typed: [{ name: 'injector', type: 'Injector' }],
        lookups: [
          lookup('koinViewModel', {
            scopes: [inFun('OrdersScreen', { topLevel: true, annotations: ['Composable'] })],
          }),
          lookup('koinInject', { scopes: [inFun('load'), inClass()] }),
          lookup('getInstance', { qualifier: 'injector' }),
        ],
      }),
    ]);

    expect(findings.map(({ message }) => message)).toEqual([
      composeMessage('koinViewModel()'),
      koinMessage('Koin koinInject()'),
      lookupMessage('Injector.getInstance()'),
    ]);
  });
});

describe('service lookups that are not locators', () => {
  const koin = [imp('org.koin.core.component.get'), imp('org.koin.core.component.inject')];

  it.each([
    ['a get that no Koin import resolves', [], [lookup('get')]],
    ['a collection get on an unknown receiver', koin, [lookup('get', { qualifier: 'prices' })]],
    [
      'a Ktor route get with a handler',
      koin,
      [
        lookup('get', {
          lambda: true,
          positional: 1,
          arguments: [
            argument('"/orders"'),
            argument('{ call.respond(orders) }', { lambda: true }),
          ],
        }),
      ],
    ],
    [
      'a bare get with a positional argument that is no Koin qualifier',
      [imp('org.koin.core.component', { all: true })],
      [lookup('get', { positional: 1, arguments: [argument('index')] })],
    ],
    [
      'a get with a named argument Koin does not take',
      [imp('org.koin.core.component', { all: true })],
      [lookup('get', { arguments: [argument('1', { name: 'index' })] })],
    ],
    [
      'a directory lookup',
      [imp('javax.naming.directory.DirContext'), imp('javax.naming.ldap.InitialLdapContext')],
      [
        lookup('lookup', { qualifier: 'directory' }),
        lookup('lookup', { qualifier: 'InitialLdapContext()' }),
      ],
    ],
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
    const typed = [
      { name: 'registry', type: 'Registry' },
      { name: 'directory', type: 'DirContext' },
    ];

    expect(flagged({ imports, lookups, typed })).toEqual([]);
  });

  it('leaves test files alone', () => {
    const cdi = [imp('jakarta.enterprise.inject.spi.CDI')];

    expect(
      summary(
        findingsFor([
          testFile({ imports: cdi, lookups: [lookup('current', { qualifier: 'CDI' })] }),
        ]),
      ),
    ).toEqual([]);
  });
});
