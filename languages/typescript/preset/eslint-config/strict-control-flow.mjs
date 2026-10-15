import { SYNTAX_EXCEPTION_HINT } from './rule-hints.mjs';

const loopMessage = 'for...of is the only loop; iterate the items with for...of.';
const promiseChainMessage = `Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.${SYNTAX_EXCEPTION_HINT}`;

export const loopSelectors = [
  { selector: 'ForStatement', message: loopMessage },
  { selector: 'ForInStatement', message: loopMessage },
  { selector: 'WhileStatement', message: loopMessage },
  { selector: 'DoWhileStatement', message: loopMessage },
];

const testLoopMessage =
  'for...of is the only loop; iterate the items with for...of, or give each case its own test with it.each.';

const testLoopSelectors = loopSelectors.map(({ selector }) => ({
  selector,
  message: testLoopMessage,
}));

export const forEachSelectors = [
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: 'Use a for...of loop instead of forEach.',
  },
];

const promiseChainSelectors = [
  {
    selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
    message: promiseChainMessage,
  },
];

export const controlFlowSelectors = [...loopSelectors, ...forEachSelectors];

export const testControlFlowSelectors = [...testLoopSelectors, ...forEachSelectors];

export const promiseChainRule = {
  'nitpicker/no-promise-chain': ['error', ...promiseChainSelectors],
};

export const controlFlowRules = { eqeqeq: ['error', 'always'], ...promiseChainRule };

export const controlFlowTypedRules = { '@typescript-eslint/no-floating-promises': 'error' };
