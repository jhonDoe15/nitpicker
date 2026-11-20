import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-placeholder-implementation.mts';

const tester = typescriptRuleTester();
const PLACEHOLDER = [{ messageId: 'placeholder' }];
const lines = (...parts: readonly string[]) => parts.join('\n');
const rate = (...body: readonly string[]) =>
  lines('async function exchangeRate(from: string, to: string) {', ...body, '}');

tester.run('no-placeholder-implementation', rule, {
  valid: [
    rate(
      '// In a real implementation, this would call the rates API',
      'return rates.get(from, to);',
    ),
    rate('// In a real browser the event fires twice', 'return 1.1;'),
    rate('// The fallback rate for now', 'return 1.1;'),
    rate('// Mock data', 'return 1.1;'),
    rate('// Simulate loading delay for better UX', 'await sleep(300);', 'return load(from, to);'),
    rate('// In a real scenario the caller retries', '', 'return 1.1;'),
    rate('const rate = 1.1; // in a real app this is fetched', 'return rate * 2;'),
    rate('// In a real app this is fetched', 'const rate = await load(from, to);', 'return rate;'),
    rate('// In a real app this is fetched', 'return { from, to, rate: 1.1 };'),
    rate('// Simulate network delay', 'await new Promise((resolve) => queue.push(resolve));'),
    rate('// Replace with the real total', 'total = compute(from);'),
    rate('// Replace this with a real implementation', 'throw new Error("not implemented");'),
    lines('// Placeholder implementation', 'export const rates = load();'),
    lines('function send() {', '  log("sent");', '  // placeholder implementation', '}'),
    lines('if (ready) {', '  // placeholder implementation', '}'),
    {
      code: rate('// In a real implementation, this would call the rates API', 'return 1.1;'),
      filename: 'src/rates/rates.test.ts',
    },
    {
      code: rate('// In a real implementation, this would call the rates API', 'return 1.1;'),
      filename: 'examples/rates.ts',
    },
    {
      code: rate('// Simulate API call', 'await sleep(500);'),
      filename: 'src/components/rates.stories.tsx',
    },
    {
      code: lines('// Mock data for now', 'export const users = [{ id: 1 }];'),
      filename: 'src/__mocks__/users.ts',
    },
  ],
  invalid: [
    {
      code: rate('// In a real implementation, this would call the rates API', 'return 1.1;'),
      errors: PLACEHOLDER,
    },
    {
      code: rate(
        '// In a real implementation, this would call the rates API',
        'await new Promise((resolve) => setTimeout(resolve, 500)); // simulate network delay',
        'return 1.1;',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: rate('/* Simulating an API call */', 'await sleep(1000);', 'return load(from);'),
      errors: PLACEHOLDER,
    },
    {
      code: rate('// Simulate a request', 'await delay(1000);', 'return load(from);'),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        'function total(balance: number) {',
        '  // In a real scenario, you would fetch exchange rates here',
        '  const convertedBalance = balance;',
        '  return convertedBalance;',
        '}',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        'function total(account) {',
        '  let converted = 0;',
        '  // In a real app this converts',
        '  // between the two currencies',
        '  converted = account.balance;',
        '  return converted;',
        '}',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        'function whoami() {',
        '  // For now, we just return a dummy user id and email',
        '  return { id: "1", email: "user@example.org" };',
        '}',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        '// Mock data for now',
        'const users = [{ id: 1, name: "Ada" }, { id: 2, name: "Bo" }];',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: lines('function send(message: string) {', '  // Placeholder implementation', '}'),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        'const send = async () => {',
        '  // TODO: replace with actual email service',
        '};',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: lines(
        'function enabled() {',
        '  // Replace this with a real check',
        '  return true;',
        '}',
      ),
      errors: PLACEHOLDER,
    },
    {
      code: rate('// In a real implementation, this would call the rates API', 'return 1.1;'),
      filename: 'src/latest/contest.ts',
      errors: PLACEHOLDER,
    },
  ],
});
