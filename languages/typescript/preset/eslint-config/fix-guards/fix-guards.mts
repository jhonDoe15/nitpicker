import { demoted, type FixGuard } from './guard-types.mts';
import { PREFER_INCLUDES } from './rules/prefer-includes.mts';

const REVIEWED: FixGuard = { status: 'review', guard: demoted };

export const FIX_GUARDS: Readonly<Record<string, Readonly<Record<string, FixGuard>>>> = {
  '@typescript-eslint': {
    'no-useless-default-assignment': REVIEWED,
    'prefer-includes': PREFER_INCLUDES,
  },
};
