import { describe, expect, it } from 'vitest';
import { restrictedSyntaxByScope, strictSyntaxConfig } from '../strict.mjs';

const commonBans = [
  {
    selector: "TSAsExpression:not([typeAnnotation.typeName.name='const'])",
    message:
      'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
  },
  {
    selector: 'TSTypeAssertion',
    message:
      'Do not assert with `<Type>value`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source.',
  },
  {
    selector: 'TSAnyKeyword',
    message:
      'Use `unknown` and parse it into a specific type at the boundary with zod, or write the specific type.',
  },
  {
    selector: 'TSNonNullExpression',
    message:
      'Do not use the non-null assertion `!`. Check for `undefined` and return early, or make the type non-optional at its source.',
  },
  {
    selector:
      "Literal[raw='null']:not(BinaryExpression[operator=/^[!=]==$/] > Literal):not(CallExpression[callee.object.name='JSON'][callee.property.name='stringify'] > Literal)",
    message:
      'Use `undefined` for an absent value. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument.',
  },
  {
    selector: 'TSNullKeyword',
    message:
      'Use `undefined` for an absent value. `null` is only for strict comparison with a library value and the `JSON.stringify` replacer argument. Type it as optional with `undefined`.',
  },
  {
    selector: 'TSEnumDeclaration',
    message:
      "Do not declare an `enum`. Use a union of string literals: `type Mode = 'read' | 'write'`.",
  },
  {
    selector: "TSModuleDeclaration[kind=/^(namespace|module)$/][id.type='Identifier']",
    message:
      'Do not declare a `namespace`. Put the declarations in their own module and use named exports.',
  },
  {
    selector:
      'ClassDeclaration:not([superClass.name=/Error$/]):not([superClass.property.name=/Error$/]), ClassExpression:not([superClass.name=/Error$/]):not([superClass.property.name=/Error$/])',
    message:
      'Classes are only for `Error` subclasses (`class NameError extends Error`). Use a `type` for data and `function` declarations for behavior; construct dependencies in the composition root.',
  },
  {
    selector: "VariableDeclarator[id.type='Identifier'] > ArrowFunctionExpression.init",
    message:
      'Declare named functions with the `function` keyword (`function name() {}`). Arrow functions are only for inline callbacks.',
  },
  {
    selector: "VariableDeclarator[id.type='Identifier'] > FunctionExpression.init",
    message:
      'Declare named functions with the `function` keyword (`function name() {}`), not a function expression assigned to a variable.',
  },
  {
    selector: 'IfStatement[alternate] > BlockStatement.consequent > ReturnStatement:last-child',
    message:
      'Return early instead of using `else` after `return`: remove the `else` and put the remaining code after the `if` block.',
  },
  {
    selector: 'IfStatement[alternate] > ReturnStatement.consequent',
    message:
      'Return early instead of using `else` after `return`: remove the `else` and put the remaining code after the `if` statement.',
  },
  {
    selector: 'ConditionalExpression > ConditionalExpression',
    message:
      'Do not nest ternaries. Use early returns, a lookup object keyed by the value, or one `const` per branch.',
  },
  {
    selector:
      "TSInterfaceDeclaration:not(:matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global']) TSInterfaceDeclaration):not(Program:not(:has(> ImportDeclaration, > ExportNamedDeclaration, > ExportDefaultDeclaration, > ExportAllDeclaration, > TSExportAssignment)) > TSInterfaceDeclaration)",
    message:
      'Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation, or a global declaration file without imports or exports, may declare an `interface`.',
  },
  {
    selector:
      "ExportDefaultDeclaration:not(:matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global']) ExportDefaultDeclaration)",
    message:
      'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files and `declare module` blocks.',
  },
  {
    selector: "ExportSpecifier[exported.name='default']",
    message:
      'Use a named export (`export { name }`). Default exports are only allowed in config files.',
  },
  {
    selector: 'ExportAllDeclaration',
    message:
      "List the public names: `export { name } from './module.js'`. `export *` makes every internal export public. If it is deliberate, add an exception for this rule in nitpicker.config.json.",
  },
];

const loopBans = [
  {
    selector: 'ForStatement',
    message: 'for...of is the only loop; iterate the items with for...of.',
  },
  {
    selector: 'ForInStatement',
    message: 'for...of is the only loop; iterate the items with for...of.',
  },
  {
    selector: 'WhileStatement',
    message: 'for...of is the only loop; iterate the items with for...of.',
  },
  {
    selector: 'DoWhileStatement',
    message: 'for...of is the only loop; iterate the items with for...of.',
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: 'Use a for...of loop instead of forEach.',
  },
];

const promiseBans = [
  {
    selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
    message:
      'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
  },
  {
    selector:
      "ExpressionStatement > AwaitExpression > CallExpression[callee.object.name='Promise'][callee.property.name='allSettled']",
    message:
      'Promise.allSettled with its result dropped hides every rejection. Read the results and handle the rejected ones, or use Promise.all to fail on the first rejection.',
  },
  {
    selector:
      "NewExpression[callee.name='Promise'] > ArrowFunctionExpression[body.type='CallExpression'][body.callee.name='resolve'], NewExpression[callee.name='Promise'] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement[body.length=1] > ExpressionStatement > CallExpression[callee.name='resolve']",
    message:
      'Do not wrap a value in `new Promise`. Return it from an async function, or use `Promise.resolve(value)`; `new Promise` is for callback APIs.',
  },
];

const domainOnlyBans = [
  {
    selector: 'ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement',
    message:
      'domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message:
      'domain/ code does not use forEach: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  },
  {
    selector: "CallExpression[callee.property.name='reduce'][arguments.length!=2]",
    message:
      'domain/ code does not use reduce without an initial value: pass one, e.g. xs.reduce((sum, x) => sum + x, 0).',
  },
  {
    selector: "CallExpression[callee.property.name='reduceRight']",
    message:
      'domain/ code does not use reduceRight: fold with xs.reduce((sum, x) => sum + x, 0) (pass an initial value) or transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/], ' +
      'CallExpression[callee.property.name=/^(call|apply|bind)$/]' +
      '[callee.object.property.name=/^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/]',
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
    message:
      'domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. If it is deliberate, add an exception for this rule in nitpicker.config.json.',
  },
  {
    selector: [
      "CallExpression[callee.object.name=/^(dayjs|moment)$/][callee.property.name='utc'][arguments.length=0]",
      'CallExpression[callee.property.name=/^(fromNow|toNow)$/]',
      "MemberExpression[object.name='Temporal'][property.name='Now']",
      String.raw`ImportDeclaration[source.value=/^date-fns/] ImportSpecifier[imported.name=/^(isToday|isTomorrow|isYesterday|isPast|isFuture|isThis[A-Z]\w*|startOfToday|endOfToday|startOfTomorrow|endOfTomorrow|startOfYesterday|endOfYesterday|formatDistanceToNow|formatDistanceToNowStrict)$/]`,
      ":matches(NewExpression, CallExpression)[callee.type='MemberExpression'][callee.object.name=/^(globalThis|window|self|global)$/][callee.property.name='Date']",
      "MemberExpression[object.type='MemberExpression'][object.object.name=/^(globalThis|window|self|global)$/][object.property.name='Date'][property.name='now']",
      "MemberExpression[object.type='MemberExpression'][object.object.name=/^(globalThis|window|self|global)$/][object.property.name='Math'][property.name='random']",
    ].join(', '),
    message:
      'domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. If it is deliberate, add an exception for this rule in nitpicker.config.json.',
  },
  {
    selector:
      'MemberExpression[object.name=/^(globalThis|window|self|global)$/]:matches(' +
      '[property.name=/^(process|fetch|setTimeout|setInterval|setImmediate|queueMicrotask|performance|XMLHttpRequest|WebSocket|localStorage|sessionStorage)$/], ' +
      '[property.value=/^(process|fetch|setTimeout|setInterval|setImmediate|queueMicrotask|performance|XMLHttpRequest|WebSocket|localStorage|sessionStorage)$/])',
    message:
      'domain/ code does no I/O and does not touch the process or timers: do it in adapters/ and pass the result in as a parameter. If it is deliberate, add an exception for this rule in nitpicker.config.json.',
  },
  {
    selector:
      'ImportDeclaration[source.value=/^(dayjs|moment)$/] > :matches(ImportDefaultSpecifier, ImportNamespaceSpecifier)[local.name!=/^(dayjs|moment)$/]',
    message:
      "domain/ code imports dayjs and moment under their own names (`import dayjs from 'dayjs'`), so a clock read such as `dayjs()` stays visible. domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/. If it is deliberate, add an exception for this rule in nitpicker.config.json.",
  },
  {
    selector:
      "CallExpression[callee.object.name='Object'][callee.property.name=/^(assign|defineProperty|defineProperties|setPrototypeOf)$/]:not([arguments.0.type='ObjectExpression'])",
    message:
      'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
  },
  {
    selector:
      "CallExpression[callee.object.name='Reflect'][callee.property.name=/^(set|defineProperty|deleteProperty|setPrototypeOf|apply)$/], " +
      "CallExpression[callee.object.name='Atomics'][callee.property.name=/^(store|add|sub|and|or|xor|exchange|compareExchange)$/]",
    message:
      'domain/ code does not change values through Reflect or Atomics: return a new value with spread, e.g. { ...value, field }.',
  },
  {
    selector: "UnaryExpression[operator='delete']",
    message:
      'domain/ code does not use delete: build a new object without the key using Object.fromEntries and filter.',
  },
  {
    selector:
      "TSArrayType:not(TSTypeOperator[operator='readonly'] > TSArrayType), TSTupleType:not(TSTypeOperator[operator='readonly'] > TSTupleType)",
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

const adaptersOnlyBans = [
  {
    selector:
      'ThrowStatement > :matches(Literal, TemplateLiteral, ObjectExpression, ArrayExpression)',
    message:
      'Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.',
  },
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message:
      'Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.',
  },
];

describe('no-restricted-syntax lists per scope', () => {
  it('gives every scope the complete list of the scopes it is nested in', () => {
    const { source, domain, adapters } = restrictedSyntaxByScope;

    expect(domain).toEqual([...commonBans, ...promiseBans, ...domainOnlyBans]);
    expect(adapters).toEqual([...commonBans, ...loopBans, ...promiseBans, ...adaptersOnlyBans]);
    expect(source).toEqual([...commonBans, ...loopBans, ...promiseBans]);
    expect(domain.length).toBeGreaterThan(source.length);
    expect(adapters.length).toBeGreaterThan(source.length);
  });

  it('configures exactly one duplicate-free list per scope', () => {
    const lists = strictSyntaxConfig
      .filter((entry) => entry.rules?.['no-restricted-syntax'] !== undefined)
      .map((entry) => entry.rules['no-restricted-syntax'].slice(1));

    expect(lists).toHaveLength(4);
    for (const selectors of lists) {
      expect(new Set(selectors).size).toBe(selectors.length);
    }
  });
});
