import { lineLength } from './python-line-length.mjs';
import { indentationWidth, stringQuotes } from './python-measures.mjs';

const PYTHON_FILES = ['**/*.py'];

export const PYTHON_QUOTES = 'python.quotes';
export const PYTHON_LINE_LENGTH = 'python.lineLength';
export const PYTHON_INDENTATION = 'python.indentation';

export const PYTHON_CONVENTIONS = [
  {
    id: PYTHON_QUOTES,
    label: 'Python quotes',
    options: ['double', 'single'],
    optionLabels: { double: 'double quotes', single: 'single quotes' },
    fallback: 'double',
    files: PYTHON_FILES,
    measure: stringQuotes,
  },
  {
    id: PYTHON_LINE_LENGTH,
    label: 'Python line length',
    options: ['79', '88', '100', '120'],
    optionLabels: { 79: '79 columns', 88: '88 columns', 100: '100 columns', 120: '120 columns' },
    fallback: '88',
    files: PYTHON_FILES,
    measure: lineLength,
  },
  {
    id: PYTHON_INDENTATION,
    label: 'Python indentation',
    options: ['4', '2'],
    optionLabels: { 4: '4 spaces', 2: '2 spaces' },
    fallback: '4',
    files: PYTHON_FILES,
    measure: indentationWidth,
  },
];
