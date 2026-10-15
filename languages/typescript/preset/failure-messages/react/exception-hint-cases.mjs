import strictSyntaxConfig from '../../eslint-config/strict.mjs';

const framework = 'for those paths in nitpicker.config.json';

export const exceptionHintCases = [
  ['default export', 'export default function Page() { return 1; }'],
  ['default export specifier', 'const Page = 1; export { Page as default };'],
  ['promise chain', "export const load = () => import('./x.js').then((m) => m.x);"],
  ['null', 'export const value = null;'],
  ['null type', 'export type Maybe = string | null;'],
].map(([name, banned]) => ({
  name: `${name} names the no-restricted-syntax exception`,
  config: strictSyntaxConfig,
  filename: 'src/main/ui/fixture.tsx',
  banned,
  allowed: `\`no-restricted-syntax\` ${framework}`,
}));
