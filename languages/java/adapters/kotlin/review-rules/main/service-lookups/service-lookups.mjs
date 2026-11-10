import { enclosingFunction, hierarchiesOf, isCompositionPoint } from './composition-points.mjs';
import { functionApi, receiverApi, staticApi } from './lookup-apis.mjs';
import {
  fqnsOf,
  importedFunctions,
  inKoinComponent,
  receiverTypes,
  simpleName,
} from './lookup-resolution.mjs';

export const SERVICE_LOOKUP_RULE = 'ServiceLocatorLookup';

const ALLOWED =
  'The entry main function, Koin definitions and functions that take a Koin Scope, Android components, default parameter values, a Guice Module configure function, @Provides and @Produces functions, @Bean functions of a @Configuration class and CDI extensions may look dependencies up.';

function lookupMessage(label) {
  return `Take the dependency as a constructor parameter (a Provider or a factory parameter when it is optional or created per use) instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`;
}

function koinMessage(label) {
  return `Take the dependency as a constructor parameter and pass it in the Koin module definition (single { Orders(get()) }), with a Lazy<T> or a function type parameter for a lookup that must wait, instead of looking it up with ${label} where it is used: the lookup hides what the class needs. ${ALLOWED}`;
}

function composeMessage(label) {
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

function isKoinArgument({ name, text = '', lambda }) {
  if (name !== undefined && name !== null) {
    return KOIN_ARGUMENTS.has(name);
  }
  return lambda ? PARAMETERS_LAMBDA.test(text) : QUALIFIER_ARGUMENT.test(text);
}

function hasKoinShape(lookup) {
  const { arguments: given } = lookup;
  if (given === undefined) {
    return lookup.positional === 0 && !lookup.lambda;
  }
  return given.every((argument) => isKoinArgument(argument));
}

function functionLabel(file, lookup) {
  const { name, scopes = [] } = lookup;
  const imported = importedFunctions(file, name).find((entry) =>
    functionApi(entry.name, entry.owner),
  );
  if (imported !== undefined && hasKoinShape(lookup)) {
    const api = functionApi(imported.name, imported.owner);
    return { label: `Koin ${imported.name}()`, koin: true, compose: api.compose === true };
  }
  return name === 'getKoin' && inKoinComponent(file, scopes)
    ? { label: 'Koin getKoin()', koin: true }
    : undefined;
}

function labelFor(file, lookup) {
  const { name, qualifier } = lookup;
  if (qualifier === undefined || qualifier === null) {
    return functionLabel(file, lookup);
  }
  const owner = DOTTED_NAME.test(qualifier)
    ? fqnsOf(file, qualifier).find((candidate) => staticApi(name, candidate))
    : undefined;
  if (owner !== undefined) {
    return {
      label: `${simpleName(owner)}.${name}()`,
      koin: staticApi(name, owner).koin === true,
    };
  }
  const types = receiverTypes(file, lookup);
  const api = receiverApi(name, types);
  return api === undefined
    ? undefined
    : {
        label: `${simpleName(api.receivers.find((type) => types.includes(type)))}.${name}()`,
        koin: api.koin === true,
      };
}

function messageFor(lookup, found) {
  const { fun } = enclosingFunction(lookup.scopes ?? []);
  const composable = (fun?.annotations ?? []).includes('Composable');
  if (found.compose && composable) {
    return composeMessage(found.label);
  }
  return found.koin ? koinMessage(found.label) : lookupMessage(found.label);
}

function callPrefix({ qualifier, name }) {
  return `${qualifier === undefined || qualifier === null ? '' : `${qualifier}.`}${name}(`.replaceAll(
    OPTIONAL_CALL,
    '.',
  );
}

function ownerOf(scopes) {
  const klass = scopes.find(({ k }) => k === 'class');
  const fn = scopes.find(({ k }) => k === 'fun');
  return [klass?.qualified, fn?.name].filter(Boolean).join('.');
}

function lookupsIn(file, hierarchies) {
  if (file.test) {
    return [];
  }
  return (file.lookups ?? [])
    .filter((lookup) => !isCompositionPoint(file, lookup, hierarchies))
    .map((lookup) => ({ lookup, found: labelFor(file, lookup) }))
    .filter(({ found }) => found !== undefined);
}

function withoutChained(found) {
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

export function serviceLookupFindings(files, { finding, declaredIn = files }) {
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
