import functional from 'eslint-plugin-functional';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

/** The pure-logic folders of every feature, below each source root of the layout. */
export function domainGlobsFor(sourceRoots) {
  return sourceRoots.map((root) => `${root}/main/features/*/domain/**/*.${codeExtensions}`);
}

export const domainGlobs = domainGlobsFor(['src']);

const MUTATING_ARRAY_METHODS = 'push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';
const READONLY_WRAPPER = "TSTypeOperator[operator='readonly']";
const TRANSFORMS =
  'map, filter, flatMap, reduce with an initial value, Object.fromEntries or Object.groupBy';

// Selectors for the no-restricted-syntax rule. Exported so the strict preset assembler can
// concatenate them with other no-restricted-syntax selectors scoped to the same files: a flat
// config entry for a rule replaces, rather than extends, an earlier entry for that rule.
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
    selector: `CallExpression[callee.property.name=/^(${MUTATING_ARRAY_METHODS})$/]`,
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

export const domainFunctionalRules = {
  'functional/no-let': 'error',
  'functional/no-classes': 'error',
  'functional/no-this-expressions': 'error',
};

// Rules that need type information (a parserOptions program). strict.mjs enables them in the
// preset's typed config; the standalone domain config below runs without a type program.
export const domainTypeAwareFunctionalRules = {
  'functional/prefer-immutable-types': ['error', { enforcement: 'ReadonlyDeep' }],
};

export const strictDomainConfig = [
  { ignores: excludedGlobs },
  {
    files: domainGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { functional, nitpicker: nitpickerRules },
    rules: {
      ...domainFunctionalRules,
      'no-restricted-syntax': ['error', ...domainRestrictedSyntax],
      'nitpicker/no-self-recursion': 'error',
      'nitpicker/no-throw': 'error',
      'nitpicker/no-unknown-in-domain': 'error',
    },
  },
];
