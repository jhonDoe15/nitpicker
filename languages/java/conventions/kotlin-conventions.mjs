import { indentationStep } from './java-conventions.mjs';
import { lineLength } from './kotlin-line-length.mjs';
import { trailingCommas, wildcardImports } from './kotlin-measures.mjs';

const KOTLIN_FILES = ['**/*.kt'];

export const KOTLIN_INDENTATION = 'kotlin.indentation';
export const KOTLIN_TRAILING_COMMAS = 'kotlin.trailingCommas';
export const KOTLIN_WILDCARD_IMPORTS = 'kotlin.wildcardImports';
export const KOTLIN_LINE_LENGTH = 'kotlin.lineLength';

export const KOTLIN_CONVENTIONS = [
  {
    id: KOTLIN_INDENTATION,
    label: 'Kotlin indentation',
    options: ['2', '4'],
    optionLabels: { 2: '2 spaces', 4: '4 spaces' },
    fallback: undefined,
    files: KOTLIN_FILES,
    measure: indentationStep,
  },
  {
    id: KOTLIN_TRAILING_COMMAS,
    label: 'Kotlin trailing commas',
    options: ['always', 'never'],
    optionLabels: { always: 'required in wrapped lists', never: 'not used' },
    fallback: 'always',
    files: KOTLIN_FILES,
    measure: trailingCommas,
  },
  {
    id: KOTLIN_WILDCARD_IMPORTS,
    label: 'Kotlin imports',
    options: ['explicit', 'wildcard'],
    optionLabels: { explicit: 'explicit only', wildcard: 'wildcards allowed' },
    fallback: 'explicit',
    files: KOTLIN_FILES,
    measure: wildcardImports,
  },
  {
    id: KOTLIN_LINE_LENGTH,
    label: 'Kotlin line length',
    options: ['100', '120', '140'],
    optionLabels: { 100: '100 columns', 120: '120 columns', 140: '140 columns' },
    fallback: undefined,
    files: KOTLIN_FILES,
    measure: lineLength,
  },
];
