import { bareType, importsFrom, simpleTypeName } from '../../kotlin-facts.mjs';

const KOTLINX = 'kotlinx.coroutines';
const KOTLINX_FUNCTIONS = new Set([
  'withContext',
  'withTimeout',
  'withTimeoutOrNull',
  'coroutineScope',
  'supervisorScope',
  'awaitAll',
]);
const KOTLINX_METHODS = new Map([
  ['Deferred', new Set(['await'])],
  ['CompletableDeferred', new Set(['await'])],
  ['Channel', new Set(['receive'])],
  ['ReceiveChannel', new Set(['receive'])],
  ['Flow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
  ['StateFlow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
  ['SharedFlow', new Set(['first', 'single', 'last', 'count', 'fold', 'reduce'])],
]);
const SUSPEND = 'suspend';

function allSuspend(functions) {
  return functions.length > 0 && functions.every(({ modifiers }) => modifiers.includes(SUSPEND));
}

function importsKotlinx(file, name, subpackage = '') {
  const prefix = `${KOTLINX}${subpackage}`;
  return file.imports.some(
    ({ path, all }) => path === `${prefix}.${name}` || (all && path === prefix),
  );
}

export function viewOf(files) {
  const functions = files.flatMap((file) =>
    file.functions.map((declared) => ({ ...declared, package: file.package })),
  );
  const classes = files.flatMap((file) => file.classes);
  return {
    functions,
    classes,
    members: (owner, name) =>
      functions.filter((declared) => declared.owner === owner && declared.name === name),
    named: (name) => functions.filter((declared) => declared.name === name),
    classNamed: (name) => {
      const matches = classes.filter((declared) => declared.name === name);
      return matches.length === 1 ? matches[0] : undefined;
    },
  };
}

function declaredType(name, update, { file, view, klass }) {
  const method = update.scopes.find(({ k }) => k === 'fun')?.name;
  const parameters = view.functions
    .filter((declared) => declared.name === method && declared.owner === (klass?.qualified ?? ''))
    .flatMap((declared) => declared.parameters)
    .filter((parameter) => parameter.name === name);
  if (parameters.length > 0) {
    return new Set(parameters.map(({ type }) => type)).size === 1 ? parameters[0].type : undefined;
  }
  if (update.locals.includes(name) || klass === undefined) {
    return undefined;
  }
  const constructor = view.classes
    .find(({ qualified }) => qualified === klass.qualified)
    ?.primaryParameters.find((parameter) => parameter.name === name && parameter.property);
  const property = file.properties.find(
    (declared) => declared.owner === klass.qualified && declared.name === name,
  );
  return constructor?.type ?? property?.type;
}

function suspendsThroughType(call, type, { file, view }) {
  const simple = simpleTypeName(type);
  const projectClass = view.classNamed(simple);
  if (projectClass !== undefined) {
    return allSuspend(view.members(projectClass.qualified, call));
  }
  const methods = KOTLINX_METHODS.get(simple);
  const subpackage = simple.endsWith('Flow') ? '.flow' : '';
  return (
    methods?.has(call) === true &&
    (importsKotlinx(file, simple, subpackage) || importsFrom(file, `${KOTLINX}${subpackage}.`))
  );
}

function suspendsWithoutReceiver(call, { file, view, klass }) {
  const own = klass === undefined ? [] : view.members(klass.qualified, call);
  if (own.length > 0) {
    return allSuspend(own);
  }
  const named = view.named(call);
  if (KOTLINX_FUNCTIONS.has(call)) {
    return named.length === 0 && importsKotlinx(file, call);
  }
  const topLevel = named.filter(({ owner }) => owner === '');
  const withoutSupertypes = klass === undefined || klass.supers.length === 0;
  return (
    withoutSupertypes &&
    named.length === topLevel.length &&
    topLevel.every(({ package: packageName }) => packageName === file.package) &&
    allSuspend(topLevel)
  );
}

export function suspendsAt(item, update, site) {
  if (item.k !== 'call') {
    return false;
  }
  const { file, view } = site;
  const { kind, name } = item.receiver;
  if (kind === 'none' || kind === 'this') {
    return suspendsWithoutReceiver(item.name, site);
  }
  if (kind === 'async') {
    return (
      item.name === 'await' && importsKotlinx(file, 'async') && view.named('async').length === 0
    );
  }
  const type = kind === 'name' ? declaredType(name, update, site) : undefined;
  return type !== undefined && suspendsThroughType(item.name, bareType(type), site);
}
