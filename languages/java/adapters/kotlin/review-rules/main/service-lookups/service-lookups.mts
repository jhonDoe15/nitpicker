import type { ArgumentFact, KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import type { Found, Hierarchies, LookupFact, LookupLabel, LookupScope } from './lookup-types.mts';
import { enclosingFunction, hierarchiesOf, isCompositionPoint } from './composition-points.mts';
import { functionApi, receiverApi, staticApi } from './lookup-apis.mts';
import {
  fqnsOf,
  importedFunctions,
  inKoinComponent,
  receiverTypes,
  simpleName,
} from './lookup-resolution.mts';

export const SERVICE_LOOKUP_RULE = 'ServiceLocatorLookup';

const ALLOWED =
  'The entry main function, Koin definitions and functions that take a Koin Scope, Android components, default parameter values, a Guice Module configure function, @Provides and @Produces functions, @Bean functions of a @Configuration class and CDI extensions may look dependencies up.';

function lookupMessage(label: string): string {
  return `Take the dependency as a constructor parameter (a Provider or a factory parameter when it is optional or created per use) instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`;
}

function koinMessage(label: string): string {
  return `Take the dependency as a constructor parameter and pass it in the Koin module definition (single { Orders(get()) }), with a Lazy<T> or a function type parameter for a lookup that must wait, instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`;
}

function composeMessage(label: string): string {
  const call = label.replace(/^Koin /u, '');
  return `Take the dependency as a parameter of the composable with ${call} as its default value (viewModel: OrdersViewModel = ${call}) instead of calling ${call} in its body: the lookup hides what the composable needs and keeps previews and tests from passing their own. ${ALLOWED}`;
}

const DOTTED_NAME = /^[\w.]+$/u;
const OPTIONAL_CALL = /\?\./gu;
const QUALIFIER_ARGUMENT = /^(?:named|qualifier|StringQualifier|TypeQualifier)\s*[(<]/u;
const PARAMETERS_LAMBDA = /^\{\s*parametersOf\s*[(<]/u;
const KOIN_ARGUMENTS = new Set([
  'qualifier',
  'parameters',
  'clazz',
  'mode',
  'scope',
  'key',
  'viewModelStoreOwner',
  'extras',
]);

function isKoinArgument({ name, text, lambda }: ArgumentFact): boolean {
  if (typeof name === 'string') {
    return KOIN_ARGUMENTS.has(name);
  }
  return lambda ? PARAMETERS_LAMBDA.test(text) : QUALIFIER_ARGUMENT.test(text);
}

function hasKoinShape(lookup: LookupFact): boolean {
  const { arguments: given } = lookup;
  if (given === undefined) {
    return lookup.positional === 0 && !lookup.lambda;
  }
  return given.every((argument) => isKoinArgument(argument));
}

function functionLabel(file: KotlinFile, lookup: LookupFact): LookupLabel | undefined {
  const { name, scopes = [] } = lookup;
  const imported = importedFunctions(file, name).find((entry) =>
    functionApi(entry.name, entry.owner),
  );
  if (imported !== undefined && hasKoinShape(lookup)) {
    const api = functionApi(imported.name, imported.owner);
    return { label: `Koin ${imported.name}()`, koin: true, compose: api?.compose === true };
  }
  return name === 'getKoin' && inKoinComponent(file, scopes)
    ? { label: 'Koin getKoin()', koin: true, compose: false }
    : undefined;
}

function labelFor(file: KotlinFile, lookup: LookupFact): LookupLabel | undefined {
  const { name, qualifier } = lookup;
  if (typeof qualifier !== 'string') {
    return functionLabel(file, lookup);
  }
  const owner = DOTTED_NAME.test(qualifier)
    ? fqnsOf(file, qualifier).find((candidate) => staticApi(name, candidate))
    : undefined;
  if (owner !== undefined) {
    return {
      label: `${simpleName(owner)}.${name}()`,
      koin: staticApi(name, owner)?.koin === true,
      compose: false,
    };
  }
  const types = receiverTypes(file, lookup);
  const api = receiverApi(name, types);
  return api === undefined
    ? undefined
    : {
        label: `${simpleName(api.receivers.find((type) => types.includes(type)) ?? '')}.${name}()`,
        koin: api.koin === true,
        compose: false,
      };
}

function messageFor(lookup: LookupFact, found: LookupLabel): string {
  const { fun } = enclosingFunction(lookup.scopes ?? []);
  const composable = (fun?.annotations ?? []).includes('Composable');
  if (found.compose && composable) {
    return composeMessage(found.label);
  }
  return found.koin ? koinMessage(found.label) : lookupMessage(found.label);
}

function callPrefix({ qualifier, name }: LookupFact): string {
  return `${typeof qualifier === 'string' ? `${qualifier}.` : ''}${name}(`.replaceAll(
    OPTIONAL_CALL,
    '.',
  );
}

function ownerOf(scopes: LookupScope[]): string {
  const klass = scopes.find(({ k }) => k === 'class');
  const fn = scopes.find(({ k }) => k === 'fun');
  return [klass?.qualified, fn?.name].filter((part) => part !== undefined && part !== '').join('.');
}

function lookupsIn(file: KotlinFile, hierarchies: Hierarchies): Found[] {
  if (file.test) {
    return [];
  }
  return (file.lookups ?? [])
    .filter((lookup) => !isCompositionPoint(file, lookup, hierarchies))
    .flatMap((lookup) => {
      const found = labelFor(file, lookup);
      return found === undefined ? [] : [{ lookup, found }];
    });
}

function withoutChained(found: Found[]): Found[] {
  const prefixes = found.map(({ lookup }) => callPrefix(lookup));
  return found.filter(
    ({ lookup }) =>
      !prefixes.some(
        (prefix) =>
          typeof lookup.qualifier === 'string' &&
          lookup.qualifier.replaceAll(OPTIONAL_CALL, '.').startsWith(prefix),
      ),
  );
}

export function serviceLookupFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  const hierarchies = hierarchiesOf(declaredIn);
  return files.flatMap((file) =>
    withoutChained(lookupsIn(file, hierarchies)).map(({ lookup, found }) => {
      const symbol = [ownerOf(lookup.scopes ?? []), found.label].filter(Boolean).join(': ');
      return finding({
        rule: SERVICE_LOOKUP_RULE,
        file: file.file,
        line: lookup.line,
        symbol,
        message: messageFor(lookup, found),
      });
    }),
  );
}
