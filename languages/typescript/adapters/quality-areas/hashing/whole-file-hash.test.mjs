import { describe, expect, it } from 'vitest';
import { wholeFileHash, withoutRelativeSpecifiers } from './whole-file-hash.mjs';

const BASE = [
  "import { price } from './price.js';",
  "export { tax } from '../shared/tax.js';",
  "const lazy = () => import('./lazy.js');",
  "const legacy = require('../legacy');",
  'export const total = price + 1;',
  '',
].join('\n');

const MOVED = [
  "import { price } from '../orders/price.js';",
  "export { tax } from '../shared/tax.js';",
  "const lazy = () => import('../orders/lazy.js');",
  "const legacy = require('../legacy');",
  'export const total = price + 1;',
  '',
].join('\n');

const hashOf = (text) => wholeFileHash(text, 'src/orders/a.ts');

describe('wholeFileHash', () => {
  it('is the same for a file that moved to another folder and imports the same modules', () => {
    expect(wholeFileHash(MOVED, 'src/billing/a.ts')).toBe(hashOf(BASE));
  });

  it('is the same whether a specifier names the extension or the index file', () => {
    const named = "import { a } from './orders/index.js';\n";
    const bare = "import { a } from './orders';\n";
    expect(hashOf(named)).toBe(hashOf(bare));
  });

  it('changes with any other edit', () => {
    expect(hashOf(BASE.replace('price + 1', 'price + 2'))).not.toBe(hashOf(BASE));
    expect(hashOf(BASE.replace("from './price.js'", "from 'pricing'"))).not.toBe(hashOf(BASE));
  });

  it('changes when an import is pointed at another module', () => {
    const fast = "import { run } from './fast';\nrun();\n";
    const slow = "import { run } from './slow';\nrun();\n";
    const dynamic = "const lazy = () => import('./fast');\n";
    expect(hashOf(slow)).not.toBe(hashOf(fast));
    expect(hashOf(dynamic.replace('./fast', './slow'))).not.toBe(hashOf(dynamic));
    expect(hashOf("const x = require('./slow');\n")).not.toBe(
      hashOf("const x = require('./fast');\n"),
    );
  });

  it('changes when a path string that is not an import changes', () => {
    const big = "const data = readFile('./big.json');\n";
    expect(hashOf(big.replace('big', 'small'))).not.toBe(hashOf(big));
  });

  it('keeps package specifiers and other strings', () => {
    const text = "import x from 'node:path';\nconst name = 'dot.dot';\n";
    expect(withoutRelativeSpecifiers(text, 'src/a.ts')).toBe(text);
  });
});
