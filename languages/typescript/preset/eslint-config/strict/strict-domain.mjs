import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { functionalPlugin } from '../../eslint-plugin/type-identity/functional-plugin.mjs';
import { codeExtensions, builtInExcludedGlobs } from '../../layout.mjs';

export function domainGlobsFor(sourceRoots) {
  return sourceRoots.map((root) => `${root}/main/features/*/domain/**/*.${codeExtensions}`);
}

const domainGlobs = domainGlobsFor(['src']);

const EXCEPTION_ROUTE = ' An exception fits only when it is deliberate.';
const CLOCK_AND_RANDOM_MESSAGE = `domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/.${EXCEPTION_ROUTE}`;
const IO_GLOBAL_MESSAGE = `domain/ code does no I/O and does not touch the process or timers: do it in adapters/ and pass the result in as a parameter.${EXCEPTION_ROUTE}`;
const DATE_FNS_CLOCK_FUNCTIONS = [
  'isToday',
  'isTomorrow',
  'isYesterday',
  'isPast',
  'isFuture',
  'isThis[A-Z]\\w*',
  'startOfToday',
  'endOfToday',
  'startOfTomorrow',
  'endOfTomorrow',
  'startOfYesterday',
  'endOfYesterday',
  'formatDistanceToNow',
  'formatDistanceToNowStrict',
].join('|');

const IO_GLOBALS = [
  'process',
  'fetch',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'performance',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
];

const GLOBAL_OBJECTS = 'globalThis|window|self|global';
const GLOBAL_OBJECT = `[object.name=/^(${GLOBAL_OBJECTS})$/]`;
const ON_GLOBAL_OBJECT = `[object.type='MemberExpression'][object.object.name=/^(${GLOBAL_OBJECTS})$/]`;
const CLOCK_IMPORTS = 'dayjs|moment';

const MUTATING_ARRAY_METHODS = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';
const READONLY_WRAPPER = "TSTypeOperator[operator='readonly']";
const TRANSFORMS =
  'map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy';

export const domainRestrictedSyntax = [
  {
    selector: 'ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement',
    message: `domain/ code has no loops: transform with ${TRANSFORMS}.`,
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: `domain/ code does not use forEach: transform with ${TRANSFORMS}.`,
  },
  {
    selector: "CallExpression[callee.property.name='reduce'][arguments.length!=2]",
    message:
      'domain/ code does not use reduce without an initial value: pass one, e.g. xs.reduce((sum, x) => sum + x, 0).',
  },
  {
    selector: "CallExpression[callee.property.name='reduceRight']",
    message: `domain/ code does not use reduceRight: fold with xs.reduce((sum, x) => sum + x, 0) (pass an initial value) or transform with ${TRANSFORMS}.`,
  },
  {
    selector: [
      `CallExpression[callee.property.name=/^(${MUTATING_ARRAY_METHODS})$/]`,
      `CallExpression[callee.property.name=/^(call|apply|bind)$/][callee.object.property.name=/^(${MUTATING_ARRAY_METHODS})$/]`,
    ].join(', '),
    message:
      'domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).',
  },
  {
    selector: "AssignmentExpression[left.type='MemberExpression']",
    message:
      'domain/ code does not assign to properties: return a new object with spread, e.g. { ...value, field }.',
  },
  {
    selector: 'AssignmentExpression[left.type=/^(ObjectPattern|ArrayPattern)$/]',
    message:
      'domain/ code does not assign to properties: return a new object with spread, e.g. { ...value, field }.',
  },
  {
    selector: "UpdateExpression[argument.type='MemberExpression']",
    message:
      'domain/ code does not mutate properties: return a new object with spread, e.g. { ...value, count: value.count + 1 }.',
  },
  {
    selector:
      "NewExpression[callee.name='Date'][arguments.length=0], CallExpression[callee.name='Date'], CallExpression[callee.property.name=/^(randomUUID|getRandomValues)$/], CallExpression[callee.name=/^(dayjs|moment)$/][arguments.length=0], CallExpression[callee.object.name='DateTime'][callee.property.name=/^(now|local|utc)$/][arguments.length=0]",
    message: CLOCK_AND_RANDOM_MESSAGE,
  },
  {
    selector: [
      "CallExpression[callee.object.name=/^(dayjs|moment)$/][callee.property.name='utc'][arguments.length=0]",
      'CallExpression[callee.property.name=/^(fromNow|toNow)$/]',
      "MemberExpression[object.name='Temporal'][property.name='Now']",
      `ImportDeclaration[source.value=/^date-fns/] ImportSpecifier[imported.name=/^(${DATE_FNS_CLOCK_FUNCTIONS})$/]`,
      `:matches(NewExpression, CallExpression)[callee.type='MemberExpression'][callee.object.name=/^(${GLOBAL_OBJECTS})$/][callee.property.name='Date']`,
      `MemberExpression${ON_GLOBAL_OBJECT}[object.property.name='Date'][property.name='now']`,
      `MemberExpression${ON_GLOBAL_OBJECT}[object.property.name='Math'][property.name='random']`,
    ].join(', '),
    message: CLOCK_AND_RANDOM_MESSAGE,
  },
  {
    selector: `MemberExpression${GLOBAL_OBJECT}:matches([property.name=/^(${IO_GLOBALS.join('|')})$/], [property.value=/^(${IO_GLOBALS.join('|')})$/])`,
    message: IO_GLOBAL_MESSAGE,
  },
  {
    selector: `ImportDeclaration[source.value=/^(${CLOCK_IMPORTS})$/] > :matches(ImportDefaultSpecifier, ImportNamespaceSpecifier)[local.name!=/^(${CLOCK_IMPORTS})$/]`,
    message: `domain/ code imports dayjs and moment under their own names (\`import dayjs from 'dayjs'\`), so a clock read such as \`dayjs()\` stays visible. ${CLOCK_AND_RANDOM_MESSAGE}`,
  },
  {
    selector:
      "CallExpression[callee.object.name='Object'][callee.property.name=/^(assign|defineProperty|defineProperties|setPrototypeOf)$/]:not([arguments.0.type='ObjectExpression'])",
    message:
      'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
  },
  {
    selector:
      "CallExpression[callee.object.name='Reflect'][callee.property.name=/^(set|defineProperty|deleteProperty|setPrototypeOf|apply)$/], CallExpression[callee.object.name='Atomics'][callee.property.name=/^(store|add|sub|and|or|xor|exchange|compareExchange)$/]",
    message:
      'domain/ code does not change values through Reflect or Atomics: return a new value with spread, e.g. { ...value, field }.',
  },
  {
    selector: "UnaryExpression[operator='delete']",
    message:
      'domain/ code does not use delete: build a new object without the key using Object.fromEntries and filter.',
  },
  {
    selector: `TSArrayType:not(${READONLY_WRAPPER} > TSArrayType), TSTupleType:not(${READONLY_WRAPPER} > TSTupleType)`,
    message:
      'domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.',
  },
  {
    selector: 'TSTypeReference[typeName.name=/^(Array|Map|Set)$/]',
    message:
      'domain/ types are readonly: write ReadonlyArray<T>, ReadonlyMap<K, V> or ReadonlySet<T> instead of Array, Map or Set.',
  },
  {
    selector: 'TSPropertySignature:not([readonly=true])',
    message: 'domain/ data types are readonly: mark the property readonly.',
  },
];

export const domainPurityRules = {
  'no-restricted-globals': [
    'error',
    ...IO_GLOBALS.map((name) => ({ name, message: IO_GLOBAL_MESSAGE })),
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: CLOCK_AND_RANDOM_MESSAGE },
    { object: 'Math', property: 'random', message: CLOCK_AND_RANDOM_MESSAGE },
    { object: 'performance', property: 'now', message: CLOCK_AND_RANDOM_MESSAGE },
  ],
};

export const domainFunctionalRules = {
  'functional/no-let': 'error',
  'functional/no-classes': 'error',
  'functional/no-this-expressions': 'error',
};

export const domainTypeAwareFunctionalRules = {
  'nitpicker/no-mutating-method-in-domain': 'error',
  'functional/prefer-immutable-types': [
    'error',
    { enforcement: 'ReadonlyDeep', variables: { ignoreInFunctions: true } },
  ],
};

export const strictDomainConfig = [
  { ignores: builtInExcludedGlobs },
  {
    files: domainGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { functional: functionalPlugin, nitpicker: nitpickerRules },
    rules: {
      ...domainFunctionalRules,
      ...domainPurityRules,
      'no-restricted-syntax': ['error', ...domainRestrictedSyntax],
      'nitpicker/no-self-recursion': 'error',
      'nitpicker/no-throw': 'error',
      'nitpicker/no-ui-framework-in-domain': 'error',
      'nitpicker/no-unknown-in-domain': 'error',
    },
  },
];
