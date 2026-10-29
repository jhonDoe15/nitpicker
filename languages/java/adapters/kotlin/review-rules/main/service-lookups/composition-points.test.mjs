import { describe, expect, it } from 'vitest';
import { file, summary } from '../../test-support/facts.mjs';
import {
  KOIN,
  findingsFor,
  flagged,
  imp,
  inClass,
  inFun,
  lookup,
  rule,
} from '../../test-support/lookup-facts.mjs';

const GUICE = [
  imp('com.google.inject.AbstractModule'),
  imp('com.google.inject.Injector'),
  imp('com.google.inject.Provides'),
];
const injected = { typed: [{ name: 'injector', type: 'Injector' }] };
const viaInjector = (scopes, line = 7) =>
  lookup('getInstance', { qualifier: 'injector', scopes, line });
const inLambda = (host) => [{ k: 'lambda', host }, inFun(), inClass()];
const topLevel = (name, overrides = {}) => [inFun(name, { topLevel: true, ...overrides })];
const stringArray = (type) => ({ type, vararg: false });

describe('composition points that may look dependencies up', () => {
  it.each([
    ['module', 'module'],
    ['single', 'single'],
    ['factory', 'factory'],
    ['viewModel', 'viewModel'],
    ['startKoin', 'startKoin'],
  ])('lets a get inside a %s definition lambda resolve against the scope', (_, host) => {
    expect(
      flagged({ imports: KOIN, lookups: [lookup('get', { scopes: inLambda(host) })] }),
    ).toEqual([]);
  });

  it.each([
    ['a top-level main without parameters', topLevel('main')],
    [
      'a top-level main(args: Array<String>)',
      topLevel('main', { parameters: [stringArray('Array<String>')] }),
    ],
    [
      'a top-level main(vararg args: String)',
      topLevel('main', { parameters: [{ type: 'String', vararg: true }] }),
    ],
    [
      'a @JvmStatic main in a companion object',
      [
        inFun('main', { annotations: ['JvmStatic'], parameters: [stringArray('Array<String>')] }),
        inClass('Companion', { object: true }),
      ],
    ],
    ['a default parameter value', [inFun('OrdersScreen', { topLevel: true })]],
    ['a Ktor Application module', topLevel('module', { receiver: 'Application' })],
    ['a function with a Koin Scope receiver', topLevel('orders', { receiver: 'Scope' })],
    [
      'a function with a Koin Scope parameter',
      topLevel('create', { parameters: [{ type: 'Scope', vararg: false }] }),
    ],
    [
      'a @Bean function of a @Configuration class',
      [
        inFun('orders', { annotations: ['Bean'] }),
        inClass('Wiring', { annotations: ['Configuration'] }),
      ],
    ],
    ['a @Provides function', [inFun('orders', { annotations: ['Provides'] }), inClass('Plain')]],
  ])('lets %s look dependencies up', (name, scopes) => {
    const imports = [
      ...KOIN,
      imp('io.ktor.server.application.Application'),
      imp('org.koin.core.scope.Scope'),
      imp('org.springframework.context.annotation.Bean'),
      imp('org.springframework.context.annotation.Configuration'),
      imp('com.google.inject.Provides'),
    ];
    const isDefault = name === 'a default parameter value';

    expect(flagged({ imports, lookups: [lookup('get', { scopes, default: isDefault })] })).toEqual(
      [],
    );
  });

  it.each([
    ['an Activity', 'androidx.appcompat.app.AppCompatActivity'],
    ['a Fragment', 'androidx.fragment.app.Fragment'],
    ['a Service', 'android.app.Service'],
    ['a BroadcastReceiver', 'android.content.BroadcastReceiver'],
    ['a ContentProvider', 'android.content.ContentProvider'],
    ['an Application', 'android.app.Application'],
    ['a CDI extension', 'jakarta.enterprise.inject.spi.Extension'],
  ])('lets %s, which has no constructor injection, look dependencies up', (_, type) => {
    const simple = type.slice(type.lastIndexOf('.') + 1);
    const scopes = [inFun('onCreate'), inClass('Screen', { supers: [simple] })];

    expect(
      flagged({
        imports: [...KOIN, imp(type)],
        lookups: [lookup('get', { scopes, delegated: true })],
      }),
    ).toEqual([]);
  });

  it('lets a project subclass of an Activity look dependencies up', () => {
    const base = file({
      imports: [imp('androidx.activity.ComponentActivity')],
      classes: [{ name: 'BaseActivity', qualified: 'BaseActivity', supers: ['ComponentActivity'] }],
    });
    const screen = file({
      file: 'src/main/kotlin/demo/Orders.kt',
      imports: KOIN,
      classes: [{ name: 'Orders', qualified: 'Orders', supers: ['BaseActivity'] }],
      lookups: [
        lookup('get', { scopes: [inFun(), inClass('Orders', { supers: ['BaseActivity'] })] }),
      ],
    });

    expect(summary(findingsFor([screen], { declaredIn: [base, screen] }))).toEqual([]);
  });

  it('lets only configure and @Provides of a Guice module, also one built on a project module, look up', () => {
    const base = file({
      imports: [imp('com.google.inject.AbstractModule')],
      classes: [{ name: 'BaseModule', qualified: 'BaseModule', supers: ['AbstractModule'] }],
    });
    const wiring = inClass('Wiring', { supers: ['BaseModule'] });
    const derived = file({
      file: 'src/main/kotlin/demo/Wiring.kt',
      imports: GUICE,
      ...injected,
      classes: [{ name: 'Wiring', qualified: 'Wiring', supers: ['BaseModule'] }],
      lookups: [
        viaInjector([inFun('configure'), wiring]),
        viaInjector([
          inFun('configure'),
          { k: 'object', supers: ['AbstractModule'] },
          inFun('load'),
        ]),
        viaInjector([inFun('orders', { annotations: ['Provides'] }), wiring]),
        viaInjector([inFun('fallback'), wiring], 20),
        viaInjector([inFun('configure'), inClass('Wiring.Nested')], 21),
      ],
    });

    expect(summary(findingsFor([derived], { declaredIn: [base, derived] }))).toEqual([
      rule('Wiring.fallback: Injector.getInstance()', 20),
      rule('Wiring.Nested.configure: Injector.getInstance()', 21),
    ]);
  });
});

describe('places next to a composition point that still report a lookup', () => {
  it.each([
    [
      'a main with another signature',
      topLevel('main', { parameters: [stringArray('String')] }),
      'main',
    ],
    [
      'a main in an object without @JvmStatic',
      [inFun('main'), inClass('Launcher', { object: true })],
      'Launcher.main',
    ],
    ['another function of the file with main', topLevel('again'), 'again'],
    [
      'a @Bean function outside a @Configuration class',
      [inFun('orders', { annotations: ['Bean'] }), inClass('Orders')],
      'Orders.orders',
    ],
    [
      'a function of a @SpringBootApplication class',
      [inFun('legacy'), inClass('Shop', { annotations: ['SpringBootApplication'] })],
      'Shop.legacy',
    ],
    ['a lambda that no Koin definition hosts', inLambda('lazy'), 'Orders.load'],
  ])('reports %s', (_, scopes, owner) => {
    const imports = [
      ...GUICE,
      imp('org.springframework.context.annotation.Bean'),
      imp('org.springframework.boot.autoconfigure.SpringBootApplication'),
    ];

    expect(flagged({ imports, ...injected, lookups: [viaInjector(scopes)] })).toEqual([
      rule(`${owner}: Injector.getInstance()`),
    ]);
  });
});
