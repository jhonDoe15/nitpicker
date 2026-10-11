import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
} from './strict-control-flow.mjs';
import { codeExtensions, excludedGlobs } from '../layout.mjs';

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
