import type { FixGuard } from './guard-types.mts';
import { PREFER_INCLUDES } from './rules/prefer-includes.mts';

export const FIX_GUARDS: Readonly<Record<string, Readonly<Record<string, FixGuard>>>> = {
  '@typescript-eslint': { 'prefer-includes': PREFER_INCLUDES },
};
