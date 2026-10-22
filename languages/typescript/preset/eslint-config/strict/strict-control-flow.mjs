import { SYNTAX_EXCEPTION_HINT } from '../rule-hints.mjs';

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

const promiseMisuseSelectors = [
  {
    selector:
      "ExpressionStatement > AwaitExpression > CallExpression[callee.object.name='Promise'][callee.property.name='allSettled']",
    message:
      'Promise.allSettled with its result dropped hides every rejection. Read the results and handle the rejected ones, or use Promise.all to fail on the first rejection.',
  },
  {
    selector: `NewExpression[callee.name='Promise'] > ArrowFunctionExpression[body.type='CallExpression'][body.callee.name='resolve'], NewExpression[callee.name='Promise'] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement[body.length=1] > ExpressionStatement > CallExpression[callee.name='resolve']`,
    message:
      'Do not wrap a value in `new Promise`. Return it from an async function, or use `Promise.resolve(value)`; `new Promise` is for callback APIs.',
  },
];

export const controlFlowSelectors = [
  ...loopSelectors,
  ...forEachSelectors,
  ...promiseMisuseSelectors,
];

export const testControlFlowSelectors = [...testLoopSelectors, ...forEachSelectors];

export const promiseChainRule = {
  'nitpicker/no-promise-chain': ['error', ...promiseChainSelectors],
};

export const controlFlowRules = { eqeqeq: ['error', 'always'], ...promiseChainRule };

export const controlFlowTypedRules = { '@typescript-eslint/no-floating-promises': 'error' };
