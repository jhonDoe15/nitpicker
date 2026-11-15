import { fieldOf } from '../../../../shared/values/readers.mts';

type Edit = {
  readonly type: string;
  readonly path: string;
  readonly start?: unknown;
  readonly [field: string]: unknown;
};

export type Fix = {
  readonly finding: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: unknown;
  };
  readonly edits: readonly Edit[];
};

export type Recipe = {
  readonly id: string;
  readonly safety: string;
  readonly scope: string;
  readonly rules: readonly { readonly tool: string; readonly rule: string }[];
  readonly plan: (input: {
    readonly files: readonly { readonly path: string; readonly text: string }[];
    readonly read: (name: string) => string | undefined;
  }) => { readonly fixes: unknown };
};

function isFix(value: unknown): value is Fix {
  return (
    typeof fieldOf(fieldOf(value, 'finding'), 'rule') === 'string' &&
    Array.isArray(fieldOf(value, 'edits'))
  );
}

function isRecipe(value: unknown): value is Recipe {
  return (
    typeof fieldOf(value, 'id') === 'string' &&
    typeof fieldOf(value, 'plan') === 'function' &&
    Array.isArray(fieldOf(value, 'rules'))
  );
}

export function fixesOf(value: unknown): readonly Fix[] {
  return Array.isArray(value) ? value.filter(isFix) : [];
}

export function recipesOf(value: readonly unknown[]): readonly Recipe[] {
  return value.filter(isRecipe);
}
