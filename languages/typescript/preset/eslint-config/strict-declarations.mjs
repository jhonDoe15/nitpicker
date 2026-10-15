const nonErrorSuperclass =
  ':not([superClass.name=/Error$/]):not([superClass.property.name=/Error$/])';
const nonComponentSuperclass =
  ':not([superClass.name=/^(Pure)?Component$/]):not([superClass.property.name=/^(Pure)?Component$/])';

function classSelectorExcluding(superclasses) {
  return `ClassDeclaration${superclasses}, ClassExpression${superclasses}`;
}

const classSelector = {
  selector: classSelectorExcluding(nonErrorSuperclass),
  message:
    'Classes are only for `Error` subclasses (`class NameError extends Error`). Use a `type` for data and `function` declarations for behavior; construct dependencies in the composition root.',
};

const reactClassSelector = {
  ...classSelector,
  selector: classSelectorExcluding(`${nonErrorSuperclass}${nonComponentSuperclass}`),
};

const declarationSelectors = [
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
  classSelector,
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

export function declarationSelectorsFor({ react = false } = {}) {
  return declarationSelectors.map((entry) =>
    react && entry === classSelector ? reactClassSelector : entry,
  );
}

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

export const moduleSurfaceSelectors = [
  {
    selector: 'ExportAllDeclaration',
    message:
      "List the public names: `export { name } from './module.js'`. `export *` makes every internal export public.",
  },
];

const moduleAugmentation =
  ":matches(TSModuleDeclaration[declare=true][id.type='Literal'], TSModuleDeclaration[declare=true][kind='global'])";

export const typeDefinitionSelectors = [
  {
    selector: `TSInterfaceDeclaration:not(${moduleAugmentation} TSInterfaceDeclaration)`,
    message:
      'Use a `type` instead of an `interface`: `type Shape = { size: number }`. Only a `declare module` or `declare global` augmentation may declare an `interface`.',
  },
];

export const typedDeclarationRules = {
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
  ],
};
