import path from 'node:path';
import { linterConfigs } from './typed/config-types.mts';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mts';
import { errorWrappingPolicy } from './policies/error-wrapping-policy.mts';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
} from './strict/strict-control-flow.mts';
import { codeExtensions, builtInExcludedGlobs } from '../layout.mjs';

export function adapterGlobsFor(sourceRoots: readonly string[]): string[] {
  return sourceRoots.map((root: string) =>
    path.posix.join(root, `main/features/*/adapters/**/*.${codeExtensions}`),
  );
}

const adapterGlobs = adapterGlobsFor(['src']);

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

export const strictAdaptersConfig = linterConfigs([
  { ignores: builtInExcludedGlobs },
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
]);

export const strictAdaptersTypedConfig = linterConfigs([
  {
    files: adapterGlobs,
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      ...controlFlowTypedRules,
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
]);
