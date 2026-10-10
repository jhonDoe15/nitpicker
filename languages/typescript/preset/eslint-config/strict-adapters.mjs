import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
} from './strict-control-flow.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

/** The I/O folders of every feature, below each source root of the layout. */
export function adapterGlobsFor(sourceRoots) {
  return sourceRoots.map((root) => `${root}/main/features/*/adapters/**/*.${codeExtensions}`);
}

export const adapterGlobs = adapterGlobsFor(['src']);

const throwMessage =
  'Throw an Error subclass that preserves cause (new DomainError(message, { cause })), not a bare Error or a non-error value.';

export const restrictedAdapterSyntax = [
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

// Adapters-only selectors (throw rules); the control-flow selectors that apply to all production
// code live in strict-control-flow.mjs and are added here for the standalone config.
// Syntactic strict rules for `features/<name>/adapters/`. These work without type information.
// The preset enables them through strict.mjs, which merges `restrictedAdapterSyntax` with the
// selectors that apply everywhere (including the control-flow ones): a config that sets `no-restricted-syntax` for the same files
// replaces this list, so this standalone config is for tests of the adapters rules on their own.
// Zod is a documented expectation of the preset, not a dependency of nitpicker: the rule works on
// syntax and its messages name the zod schema as the allowed form.
export default [
  { ignores: excludedGlobs },
  {
    files: adapterGlobs,
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: {
      'no-restricted-syntax': ['error', ...controlFlowSelectors, ...restrictedAdapterSyntax],
      ...controlFlowRules,
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
      ...controlFlowTypedRules,
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
];
