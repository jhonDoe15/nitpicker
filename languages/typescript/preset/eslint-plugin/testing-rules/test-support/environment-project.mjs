import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

export function lines(...parts) {
  return parts.join('\n');
}
export const logic = "it('adds', () => { expect(1 + 1).toBe(2); });";
export function docblock(name, tool = 'vitest') {
  return `/** @${tool}-environment ${name} */`;
}

const PROJECT_FILES = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'], '~/*': ['src/support/*'] } },
  }),
  'src/widgets/Button.tsx': 'export const Button = () => null;\n',
  'src/widgets/panel/index.jsx': 'export const Panel = () => null;\n',
  'src/widgets/format.ts': 'export const format = String;\n',
  'src/support/render.ts':
    "import { render } from '@testing-library/react';\nexport const renderApp = render;\n",
  'src/support/index.ts': "export * from './render';\n",
  'src/support/chain-a.ts': "export { renderApp } from './chain-b';\n",
  'src/support/chain-b.ts': "export * from './render';\n",
  'src/support/dom-helper.ts': 'export const reset = () => document.body.replaceChildren();\n',
  'src/support/types-only.ts': 'export type Box = HTMLElement;\n',
  'src/support/pure.ts': 'export const sum = (a: number, b: number) => a + b;\n',
  'src/support/pure-barrel.ts': "export { sum } from './pure';\n",
  'src/support/cycle-a.ts': "import './cycle-b';\nexport const a = 1;\n",
  'src/support/cycle-b.ts': "import './cycle-a';\nexport const b = 2;\n",
};

export function createProject(files = PROJECT_FILES) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dom-environment-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
