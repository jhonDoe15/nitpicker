export const declarationSelectors = [
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
];

export const defaultExportSelectors = [
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
];

export const declarationRules = {
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
};

export const typedDeclarationRules = {
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
  ],
};
