import { DEFINITION_HOSTS, functionApi, receiverApi, staticApi } from './lookup-apis.mjs';
import {
  fqnsOf,
  importedFunctions,
  inGuiceModule,
  inKoinComponent,
  isRootFile,
  moduleClassesOf,
  producesDependencies,
  receiverTypes,
  simpleName,
} from './lookup-resolution.mjs';

export const SERVICE_LOOKUP_RULE = 'ServiceLocatorLookup';

const DOTTED_NAME = /^[\w.]+$/u;
const OPTIONAL_CALL = /\?\./gu;

function messageFor(label) {
  return `Take the dependency as a constructor parameter (a Provider or a factory parameter when it is optional or created per use) instead of looking it up with ${label} where it is used: the lookup hides what the class needs. The file with fun main, an Application or Ktor module, startKoin and Koin definitions, Guice modules and @Produces or @Provides functions may look dependencies up.`;
}

function labelFor(file, lookup, typed, scopes) {
  const { name, qualifier } = lookup;
  if (qualifier === undefined) {
    const imported = importedFunctions(file, name).find((entry) =>
      functionApi(entry.name, entry.owner),
    );
    if (imported !== undefined) {
      return `Koin ${imported.name}()`;
    }
    return name === 'getKoin' && inKoinComponent(file, scopes) ? 'Koin getKoin()' : undefined;
  }
  const owner = DOTTED_NAME.test(qualifier)
    ? fqnsOf(file, qualifier).find((candidate) => staticApi(name, candidate))
    : undefined;
  if (owner !== undefined) {
    return `${simpleName(owner)}.${name}()`;
  }
  const types = receiverTypes(file, qualifier, typed);
  const api = receiverApi(name, types);
  return api === undefined
    ? undefined
    : `${simpleName(api.receivers.find((type) => types.includes(type)))}.${name}()`;
}

function allowedHere(file, lookup, modules) {
  const scopes = lookup.scopes ?? [];
  return (
    scopes.some(({ k, host }) => k === 'lambda' && DEFINITION_HOSTS.has(host)) ||
    producesDependencies(file, lookup.annotations ?? []) ||
    inGuiceModule(file, scopes, modules)
  );
}

function callPrefix({ qualifier, name }) {
  return `${qualifier === undefined ? '' : `${qualifier}.`}${name}(`.replaceAll(OPTIONAL_CALL, '.');
}

function ownerOf(scopes) {
  const klass = scopes.find(({ k }) => k === 'class');
  const fn = scopes.find(({ k }) => k === 'fun');
  return [klass?.qualified, fn?.name].filter(Boolean).join('.');
}

function lookupsIn(file, modules) {
  if (file.test || isRootFile(file)) {
    return [];
  }
  const typed = file.typed ?? [];
  return (file.lookups ?? [])
    .filter((lookup) => !lookup.lambda && !allowedHere(file, lookup, modules))
    .map((lookup) => ({ lookup, label: labelFor(file, lookup, typed, lookup.scopes ?? []) }))
    .filter(({ label }) => label !== undefined);
}

function withoutChained(found) {
  const prefixes = found.map(({ lookup }) => callPrefix(lookup));
  return found.filter(
    ({ lookup }) =>
      !prefixes.some(
        (prefix) =>
          lookup.qualifier !== undefined &&
          lookup.qualifier.replaceAll(OPTIONAL_CALL, '.').startsWith(prefix),
      ),
  );
}

export function serviceLookupFindings(files, { finding, declaredIn = files }) {
  const modules = moduleClassesOf(declaredIn);
  return files.flatMap((file) =>
    withoutChained(lookupsIn(file, modules)).map(({ lookup, label }) => {
      const symbol = [ownerOf(lookup.scopes ?? []), label].filter(Boolean).join(': ');
      return finding({
        rule: SERVICE_LOOKUP_RULE,
        file: file.file,
        line: lookup.line,
        symbol,
        message: messageFor(label),
      });
    }),
  );
}
