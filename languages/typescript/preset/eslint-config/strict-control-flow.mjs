const loopMessage = 'for...of is the only loop; iterate the items with for...of.';
const promiseChainMessage =
  'Use async/await (with try/catch) instead of promise chains, and Promise.all for concurrent work.';

export const loopSelectors = [
  { selector: 'ForStatement', message: loopMessage },
  { selector: 'ForInStatement', message: loopMessage },
  { selector: 'WhileStatement', message: loopMessage },
  { selector: 'DoWhileStatement', message: loopMessage },
];

export const forEachSelectors = [
  {
    selector: "CallExpression[callee.property.name='forEach']",
    message: 'Use a for...of loop instead of forEach.',
  },
];

export const promiseChainSelectors = [
  {
    selector: 'CallExpression[callee.property.name=/^(then|catch|finally)$/]',
    message: promiseChainMessage,
  },
];

export const controlFlowSelectors = [
  ...loopSelectors,
  ...forEachSelectors,
  ...promiseChainSelectors,
];

export const controlFlowRules = { eqeqeq: ['error', 'always'] };

export const controlFlowTypedRules = { '@typescript-eslint/no-floating-promises': 'error' };
