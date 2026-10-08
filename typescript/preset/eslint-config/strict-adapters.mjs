import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

export const adapterGlobs = [`src/main/features/*/adapters/**/*.${codeExtensions}`];

const loopMessage = 'for...of is the only loop in adapters; iterate the items with for...of.';
const promiseChainMessage =
  'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.';
const throwMessage =
  'Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.';

export const restrictedAdapterSyntax = [
  { selector: 'ForStatement', message: loopMessage },
  { selector: 'ForInStatement', message: loopMessage },
  { selector: 'WhileStatement', message: loopMessage },
  { selector: 'DoWhileStatement', message: loopMessage },
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: 'Use a for...of loop instead of forEach in adapters.',
  },
  {
    selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
    message: promiseChainMessage,
  },
  {
    selector:
      'ThrowStatement > :matches(Literal, TemplateLiteral, ObjectExpression, ArrayExpression)',
    message: throwMessage,
  },
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message: throwMessage,
  },
];

// Syntactic strict rules for `features/<name>/adapters/`. These work without type information.
// The preset enables them; they are not in the default preset yet. Another config that sets
// `no-restricted-syntax` for the same files replaces this selector list, so merge lists instead.
// Zod is a documented expectation of the preset, not a dependency of nitpicker: the rule works on
// syntax and its messages name the zod schema as the allowed form.
export default [
  { ignores: excludedGlobs },
  {
    files: adapterGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'no-restricted-syntax': ['error', ...restrictedAdapterSyntax],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'nitpicker/no-silent-catch': 'error',
      'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
      'nitpicker/no-handwritten-boundary-guard': 'error',
    },
  },
];

// Type-aware strict rules for the same files. The consuming config must give the parser type
// information (as the default preset does with parserOptions.project).
export const strictAdaptersTypedConfig = [
  {
    files: adapterGlobs,
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
];
