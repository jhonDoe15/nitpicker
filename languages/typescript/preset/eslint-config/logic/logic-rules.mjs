import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';

const SYNTAX_RULES = {
  'array-callback-return': ['error', { allowImplicit: false, checkForEach: false }],
  'no-unreachable-loop': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-template-curly-in-string': 'error',
  'no-constructor-return': 'error',
  'no-useless-return': 'error',
  '@typescript-eslint/no-unused-private-class-members': 'error',
  'no-useless-concat': 'error',
  'no-useless-call': 'error',
};

const OWN_RULES = {
  'nitpicker/no-operand-slip': 'error',
};

const TYPED_RULES = {
  '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
};

/** The allowed form each logic rule's message ends with. */
export const logicRuleHints = {
  'array-callback-return':
    ' Return a value on every path of the callback: `rows.map((row) => row.total)`, `rows.filter((row) => row.paid)`. Use `for...of` when the callback only has side effects.',
  'no-unreachable-loop':
    ' The body leaves the loop on its first pass: use `items.find(...)`, `items.some(...)` or `items[0]` for one item, or put the exit inside a condition.',
  'no-unmodified-loop-condition':
    ' Change what the condition reads inside the loop, or iterate the items with `for...of`.',
  'no-template-curly-in-string':
    ' Write it as a template literal (backticks) so the value is filled in. An exception fits only when another tool fills the placeholder: a template library, or shell, CI or Kotlin source written as a string.',
  'no-constructor-return':
    ' Set the fields and return nothing; build a different object in a factory function.',
  'no-useless-return': ' Remove the `return;`: the function ends there anyway.',
  '@typescript-eslint/no-unused-private-class-members': ' Remove it, or use it.',
  'no-useless-concat': ' Write the literals as one string.',
  'no-useless-call': ' Call the function directly: `run(value)`, not `run.call(undefined, value)`.',
  '@typescript-eslint/require-array-sort-compare':
    ' Pass a compare function: `values.toSorted((left, right) => left - right)` for numbers, `names.toSorted((left, right) => left.localeCompare(right))` for text. An untyped JavaScript array of strings passes once it has a JSDoc type: `/** @param {readonly string[]} names */`.',
};

export const logicRuleIds = Object.keys(logicRuleHints);

/** Logic rules for production and test files: `files` are their globs, `parserOptions` the typed project. */
export function logicConfigFor(files, parserOptions) {
  const plugins = { '@typescript-eslint': tseslint.plugin };
  return [
    { files, languageOptions: { parser: tseslint.parser }, plugins, rules: SYNTAX_RULES },
    {
      files,
      languageOptions: { parser: tseslint.parser },
      plugins: { nitpicker: nitpickerRules },
      rules: OWN_RULES,
    },
    {
      files,
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins,
      rules: TYPED_RULES,
    },
  ];
}
