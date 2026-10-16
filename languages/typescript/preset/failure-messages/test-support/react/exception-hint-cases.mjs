import { strictSyntaxConfig } from '../../../eslint-config/strict.mjs';

export const exceptionHintCases = [
  ['default export', 'export default function Page() { return 1; }'],
  ['default export specifier', 'const Page = 1; export { Page as default };'],
  ['promise chain', "export const load = () => import('./x.js').then((m) => m.x);"],
  ['null', 'export const value = null;'],
  ['null type', 'export type Maybe = string | null;'],
].map(([name, banned]) => ({
  name: `${name} says when an exception fits`,
  config: strictSyntaxConfig,
  filename: 'src/main/ui/fixture.tsx',
  banned,
  allowed: 'An exception fits only when a framework or library requires it',
}));
