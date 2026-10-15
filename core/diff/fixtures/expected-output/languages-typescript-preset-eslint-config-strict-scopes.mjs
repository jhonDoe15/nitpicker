import { expect } from 'vitest';
export function expectedOutput19_54() {
  return [
    'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
    'domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  ];
}

export function expectedOutput25_43() {
  return [
    'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
  ];
}

export function expectedOutput31_59() {
  return [
    'Do not assert with `as`. Narrow the value (a discriminated union check or a zod parse) or give it the correct type at its source. `as const` is allowed.',
    'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
  ];
}

export function expectedOutput37_43() {
  return [
    'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
  ];
}

export function expectedOutput42_86() {
  return ['for...of is the only loop; iterate the items with for...of.'];
}

export function expectedOutput45_41() {
  return [
    'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
  ];
}

export function expectedOutput46_61() {
  return ["Expected '===' and instead saw '=='."];
}

export function expectedOutput51_88() {
  return ['No matching configuration found for src/run.test.ts.'];
}

export function expectedOutput65_41() {
  return [
    "'retry' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. domain/ has no loops, so there use map or flatMap, or do the walk in adapters/.",
  ];
}

export function expectedOutput67_52() {
  return ['No matching configuration found for src/run.test.ts.'];
}

export function expectedOutput75_75() {
  return [
    'domain/ code has no loops: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  ];
}

export function expectedOutput78_76() {
  return [
    'domain/ code does not use forEach: transform with map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy.',
  ];
}

export function expectedOutput88_20() {
  return [
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
        "TSInterfaceDeclaration:not(:matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global']) TSInterfaceDeclaration)",
      message:
        'Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation may declare an `interface`.',
    },
    {
      selector: 'ExportDefaultDeclaration',
      message:
        'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
    },
    {
      selector: "ExportSpecifier[exported.name='default']",
      message:
        'Use a named export (`export { name }`). Default exports are only allowed in config files.',
    },
    {
      selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
      message:
        'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
    },
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
        'CallExpression[callee.property.name=/^(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)$/]',
      message:
        'domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).',
    },
    {
      selector: "AssignmentExpression[left.type='MemberExpression']",
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
        "CallExpression[callee.object.name='Date'][callee.property.name='now'], NewExpression[callee.name='Date'][arguments.length=0], CallExpression[callee.object.name='Math'][callee.property.name='random'], CallExpression[callee.property.name=/^(randomUUID|getRandomValues)$/]",
      message:
        'domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/.',
    },
    {
      selector:
        "CallExpression[callee.object.name='Object'][callee.property.name=/^(assign|defineProperty|defineProperties|setPrototypeOf)$/]:not([arguments.0.type='ObjectExpression'])",
      message:
        'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
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
}

export function expectedOutput91_22() {
  return [
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
        "TSInterfaceDeclaration:not(:matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global']) TSInterfaceDeclaration)",
      message:
        'Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation may declare an `interface`.',
    },
    {
      selector: 'ExportDefaultDeclaration',
      message:
        'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
    },
    {
      selector: "ExportSpecifier[exported.name='default']",
      message:
        'Use a named export (`export { name }`). Default exports are only allowed in config files.',
    },
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
    {
      selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
      message:
        'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
    },
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
}

export function expectedOutput92_20() {
  return [
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
        "TSInterfaceDeclaration:not(:matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global']) TSInterfaceDeclaration)",
      message:
        'Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation may declare an `interface`.',
    },
    {
      selector: 'ExportDefaultDeclaration',
      message:
        'Use a named export (`export function name() {}` or `export const name = ...`). Default exports are only allowed in config files.',
    },
    {
      selector: "ExportSpecifier[exported.name='default']",
      message:
        'Use a named export (`export { name }`). Default exports are only allowed in config files.',
    },
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
    {
      selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
      message:
        'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.',
    },
  ];
}
