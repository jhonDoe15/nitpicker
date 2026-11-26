import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as parser from '@typescript-eslint/parser';
import { afterAll, describe, expect, it } from 'vitest';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { isParser, releasingChildren } from './released-children.mts';

const typescript: unknown = createRequire(import.meta.resolve('typescript-eslint'))('typescript');
const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-released-children-'));
const sources: Readonly<Record<string, string>> = {
  'first.ts': 'export const doubled = [1, 2, 3].map((value) => value * 2);\n',
  'second.ts': "import { doubled } from './first';\nexport const count = doubled.length;\n",
};
writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ include: ['*.ts'] }));
for (const [name, text] of Object.entries(sources)) {
  writeFileSync(path.join(root, name), text);
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function parsedWith(released: unknown, name: string): unknown {
  if (!isParser(released)) {
    throw new TypeError('not a parser');
  }
  return released.parseForESLint(sources[name] ?? '', {
    filePath: path.join(root, name),
    project: './tsconfig.json',
    tsconfigRootDir: root,
    tokens: true,
    loc: true,
    range: true,
  });
}

function cachedChildren(parsed: unknown): unknown {
  const map = fieldOf(fieldOf(parsed, 'services'), 'esTreeNodeToTSNodeMap');
  const ast: unknown = fieldOf(parsed, 'ast');
  const sourceFile: unknown =
    map instanceof WeakMap && typeof ast === 'object' && ast !== null ? map.get(ast) : undefined;
  const statement: unknown = [fieldOf(sourceFile, 'statements')].flat()[0];
  const read = fieldOf(typescript, 'getNodeChildren');
  return isChildrenReader(read) ? read(statement, sourceFile) : 'unknown';
}

function isChildrenReader(value: unknown): value is (node: unknown, file: unknown) => unknown {
  return typeof value === 'function';
}

function typedParser(): Parameters<typeof releasingChildren>[0] {
  if (!isParser(parser)) {
    throw new TypeError('not a parser');
  }
  return parser;
}

describe('typed parsing that releases the child lists of the previous file', () => {
  it('keeps the child lists while the file is linted and drops them once the next file is parsed', () => {
    const released = releasingChildren(typedParser());
    const first = parsedWith(released, 'first.ts');

    expect(cachedChildren(first)).toBeInstanceOf(Array);

    parsedWith(released, 'second.ts');

    expect(cachedChildren(first)).toBeUndefined();
  });
});
