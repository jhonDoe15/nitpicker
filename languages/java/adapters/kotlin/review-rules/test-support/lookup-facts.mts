import { routed, run, type FileFacts, type ImportFact, type RuleFinding } from './facts.mts';
import {
  SERVICE_LOOKUP_RULE,
  serviceLookupFindings,
} from '../main/service-lookups/service-lookups.mts';

type Fact = Record<string, unknown>;

const ALLOWED =
  'The entry main function, Koin definitions and functions that take a Koin Scope, Android components, default parameter values, a Guice Module configure function, @Provides and @Produces functions, @Bean functions of a @Configuration class and CDI extensions may look dependencies up.';

export const KOIN: ImportFact[] = [
  { path: 'org.koin.core.component.get', alias: undefined, all: false },
  { path: 'org.koin.core.component.inject', alias: undefined, all: false },
];

export function imp(path: string, overrides: Partial<ImportFact> = {}): ImportFact {
  return { path, alias: undefined, all: false, ...overrides };
}

export function inClass(name = 'Orders', overrides: Fact = {}): Fact {
  return {
    k: 'class',
    name,
    qualified: name,
    supers: [],
    visibility: 'public',
    object: false,
    annotations: [],
    ...overrides,
  };
}

export function inFun(name = 'load', overrides: Fact = {}): Fact {
  return { k: 'fun', name, topLevel: false, annotations: [], parameters: [], ...overrides };
}

export function lookup(name: string, overrides: Fact = {}): Fact {
  return {
    line: 7,
    name,
    positional: 0,
    lambda: false,
    delegated: false,
    arguments: [],
    default: false,
    reference: false,
    scopes: [inFun(), inClass()],
    ...overrides,
  };
}

export function findingsFor(files: FileFacts[], options: Fact = {}): RuleFinding[] {
  return run(serviceLookupFindings, files, options);
}

export function rule(symbol: string, line = 7): string {
  return `${SERVICE_LOOKUP_RULE} ${symbol} ${String(line)}`;
}

export function koinMessage(label: string): string {
  return routed(
    `Take the dependency as a constructor parameter and pass it in the Koin module definition (single { Orders(get()) }), with a Lazy<T> or a function type parameter for a lookup that must wait, instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`,
    SERVICE_LOOKUP_RULE,
  );
}

export function lookupMessage(label: string): string {
  return routed(
    `Take the dependency as a constructor parameter (a Provider or a factory parameter when it is optional or created per use) instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`,
    SERVICE_LOOKUP_RULE,
  );
}

export function composeMessage(call: string, file: string): string {
  return routed(
    `Take the dependency as a parameter of the composable with ${call} as its default value (viewModel: OrdersViewModel = ${call}) instead of calling ${call} in its body: the lookup hides what the composable needs and keeps previews and tests from passing their own. ${ALLOWED}`,
    SERVICE_LOOKUP_RULE,
    file,
  );
}
