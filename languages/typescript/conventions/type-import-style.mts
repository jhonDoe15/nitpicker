import { fieldOf } from '../../../shared/values/readers.mts';
import { codeLines, winner } from './typed/measure-views.mts';

const TYPE_FILES = ['**/*.{ts,tsx,mts,cts}'];
const SEPARATE_IMPORT = /^\s*import\s+type\s+(?!from\b)[\w${*]/;
const NAMED_IMPORT = /^\s*import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}/gm;
const INLINE_SPECIFIER = /(?:^|,)\s*type\s+(?!as\b|,)[\w$]/;

const FIX_STYLES: Readonly<Record<'separate' | 'inline', string>> = {
  separate: 'separate-type-imports',
  inline: 'inline-type-imports',
};

export const TYPE_IMPORT_CONVENTION = {
  id: 'typescript.typeImports',
  label: 'Type-only imports',
  options: Object.keys(FIX_STYLES),
  optionLabels: { separate: 'import type { A }', inline: 'import { type A }' },
  fallback: 'separate',
  files: TYPE_FILES,
  measure: typeImportStyle,
};

export function typeImportFixStyle(conventions: object = {}): string | undefined {
  const choice = fieldOf(conventions, TYPE_IMPORT_CONVENTION.id) ?? TYPE_IMPORT_CONVENTION.fallback;
  return choice === 'inline' || choice === 'separate' ? FIX_STYLES[choice] : undefined;
}

function typeImportStyle(text: string): string | undefined {
  const lines = codeLines(text);
  const separate = lines.filter((line) => SEPARATE_IMPORT.test(line)).length;
  const inline = [...lines.join('\n').matchAll(NAMED_IMPORT)].filter(({ 1: specifiers }) =>
    INLINE_SPECIFIER.test(specifiers ?? ''),
  ).length;
  return winner({ separate, inline });
}
